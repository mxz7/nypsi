import { CommandInteraction } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import {
  getSupportRequestByChannelId,
  sendToRequestChannel,
} from "../utils/functions/supportrequest";
import { addNotificationToQueue } from "../utils/functions/users/notifications";
import ms = require("ms");

const cmd = new Command("close", "close a support ticket", "none");

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  const support = await getSupportRequestByChannelId(message.channel.id);

  if (!support) return;

  const embed = new CustomEmbed().setDescription("this support request has been closed");

  await sendToRequestChannel(support.userId, embed, message.client as NypsiClient);

  embed.setDescription("your support request has been closed");

  addNotificationToQueue({
    memberId: support.userId,
    payload: { embed },
  });

  const clusterHas = await (message.client as NypsiClient).cluster.broadcastEval(
    async (c, { channelId }) => {
      const client = c as unknown as NypsiClient;
      const channel = client.channels.cache.get(channelId);

      if (channel) {
        return client.cluster.id;
      } else {
        return "not-found";
      }
    },
    { context: { channelId: support.channelId } },
  );

  let shard: number;

  for (const i of clusterHas) {
    if (i != "not-found") {
      shard = i;
      break;
    }
  }

  if (isNaN(shard)) {
    return false;
  }

  await (message.client as NypsiClient).cluster.broadcastEval(
    async (c, { shard, channelId }) => {
      const client = c as unknown as NypsiClient;
      if (client.cluster.id != shard) return false;

      const channel = await client.channels.cache.get(channelId);

      if (!channel) return false;

      if (!channel.isTextBased()) return;
      if (!channel.isThread()) return;

      await channel.setLocked(true).catch(() => {});
      await channel.setArchived(true).catch(() => {});
    },
    { context: { shard: shard, channelId: support.channelId } },
  );

  await prisma.supportRequest.delete({
    where: {
      userId: support.userId,
    },
  });

  await redis.del(`${Constants.redis.cache.SUPPORT}:${support.userId}`);

  await redis.set(
    `${Constants.redis.cooldown.SUPPORT}:${support.userId}`,
    "t",
    "EX",
    Math.floor(ms("8 hours") / 1000),
  );
}

cmd.setRun(run);

module.exports = cmd;
