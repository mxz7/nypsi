import ms = require("ms");
import { randomUUID } from "crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { MStoTime } from "../../utils/functions/date";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../../utils/functions/economy/utils";
import { percentChance, shuffle } from "../../utils/functions/random";
import requestDM from "../../utils/functions/requestdm";
import { getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";
import dayjs = require("dayjs");

const max = 3;
const activityWithinSeconds = 30;
const activeUsersRequired = 2;

function doRandomDrop(client: NypsiClient) {
  const rand = Math.floor(Math.random() * ms("1 hour") + ms("30 minutes"));
  setTimeout(() => {
    randomDrop(client);
  }, rand);
  logger.info(`next random drops will occur in ${MStoTime(rand)}`);
}

export default async function startRandomDrops(client: NypsiClient) {
  doRandomDrop(client);
}

async function getChannels() {
  const query = await prisma.activeChannels.findMany({
    where: {
      createdAt: { gte: dayjs().subtract(activityWithinSeconds, "seconds").toDate() },
    },
  });

  await prisma.activeChannels.deleteMany();

  const channels: { channelId: string; users: number }[] = [];

  for (const i of query) {
    const index = channels.findIndex((j) => j.channelId === i.channelId);
    if (index > -1) {
      channels[index].users++;
    } else {
      channels.push({ channelId: i.channelId, users: 1 });
    }
  }

  return channels.filter((i) => i.users >= activeUsersRequired).map((i) => i.channelId);
}

async function randomDrop(client: NypsiClient) {
  const channels = await getChannels();

  if (channels.length === 0) return doRandomDrop(client);

  let count = 0;

  for (const channelId of shuffle(channels)) {
    count++;

    const items = Array.from(Object.values(getItems()))
      .filter((i) => i.random_drop_chance && percentChance(i.random_drop_chance))
      .map((i) => `item:${i.id}`);

    if (items.length === 0) continue;

    const prize = items[Math.floor(Math.random() * items.length)];

    const games = [fastClickGame];

    const winner = await games[Math.floor(Math.random() * games.length)](client, channelId, prize);

    if (winner) {
      if (prize.startsWith("item:")) await addInventoryItem(winner, prize.substring(5), 1);

      if ((await getDmSettings(winner)).other) {
        requestDM({
          client,
          memberId: winner,
          embed: new CustomEmbed()
            .setColor(Constants.TRANSPARENT_EMBED_COLOR)
            .setDescription(
              `you have won a ${
                prize.startsWith("item:")
                  ? `${getItems()[prize.substring(5)].emoji} **${
                      getItems()[prize.substring(5)].name
                    }**`
                  : ""
              }`,
            ),
          content: "you have won a random drop!!",
        });
      }
    }

    if (count >= max) break;
  }
}

async function fastClickGame(client: NypsiClient, channelId: string, prize: string) {
  const cluster = await findCluster(client, channelId);

  if (!cluster) return;

  const embed = new CustomEmbed()
    .setColor(0xffffff)
    .setHeader("random drop")
    .setDescription(
      `first to click the button wins ${
        prize.startsWith("item:")
          ? `a ${getItems()[prize.substring(5)].emoji} **${getItems()[prize.substring(5)].name}**`
          : ""
      }`,
    );

  const buttonId = randomUUID();

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buttonId).setLabel("click me").setStyle(ButtonStyle.Success),
  );

  const winner = await client.cluster.broadcastEval(
    async (c, { embed, row, channelId, cluster, buttonId }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = await client.channels.fetch(channelId).catch(() => {});

      if (!channel) return;

      if (!channel.isTextBased()) return;

      const msg = await channel.send({ embeds: [embed], components: [row] });

      const res = await msg
        .awaitMessageComponent({
          filter: (i) => i.customId === buttonId,
          time: 30000,
        })
        .catch(() => {});

      row.components.forEach((b) => (b.disabled = true));

      if (!res) {
        embed.description += "\n\nnobody clicked the button in time 😢";

        await msg.edit({ embeds: [embed], components: [row] });
        return;
      }

      await res.deferUpdate();

      embed.description += `\n\n**${res.user.username}** has won!!`;

      return res.user.id;
    },
    { context: { embed, row, channelId, cluster, buttonId } },
  );

  const winnerId = winner.filter((i) => Boolean(i))[0];

  if (!(await userExists(winnerId))) await createUser(winnerId);

  return winnerId;
}

async function findCluster(client: NypsiClient, channelId: string) {
  const clusterHas = await client.cluster.broadcastEval(
    async (c, { channelId }) => {
      const client = c as unknown as NypsiClient;

      const channel = await client.channels.fetch(channelId).catch(() => {});

      if (channel) {
        return client.cluster.id;
      } else {
        return "not-found";
      }
    },
    {
      context: { channelId },
    },
  );

  let shard: number;

  for (const i of clusterHas) {
    if (i != "not-found") {
      shard = i;
      break;
    }
  }

  if (isNaN(shard)) {
    return null;
  }

  return shard;
}
