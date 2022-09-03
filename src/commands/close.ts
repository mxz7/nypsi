import { CommandInteraction, Message } from "discord.js";
import prisma from "../utils/database/database";
import redis from "../utils/database/redis";
import requestDM from "../utils/functions/requestdm";
import { getSupportRequestByChannelId, sendToRequestChannel } from "../utils/functions/supportrequest";
import { NypsiClient } from "../utils/models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import ms = require("ms");

const cmd = new Command("close", "close a support ticket", Categories.NONE);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    const support = await getSupportRequestByChannelId(message.channel.id);

    if (!support) return;

    const embed = new CustomEmbed().setDescription("this support request has been closed");

    await sendToRequestChannel(support.userId, embed, message.client as NypsiClient);

    embed.setDescription("your support request has been closed, you will be able to create another in 24 hours");

    await requestDM({
        client: message.client as NypsiClient,
        content: "your support request has been closed",
        embed: embed,
        memberId: support.userId,
    });

    const clusterHas = await (message.client as NypsiClient).cluster.broadcastEval(
        async (c, { channelId }) => {
            const client = c as NypsiClient;
            const channel = await client.channels.fetch(channelId).catch(() => {});

            if (channel) {
                return client.cluster.id;
            } else {
                return "not-found";
            }
        },
        { context: { channelId: support.channelId } }
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
            const client = c as NypsiClient;
            if (client.cluster.id != shard) return false;

            const channel = await client.channels.fetch(channelId);

            if (!channel) return false;

            if (!channel.isTextBased()) return;
            if (!channel.isThread()) return;

            await channel.setLocked(true).catch(() => {});
            await channel.setArchived(true).catch(() => {});
        },
        { context: { shard: shard, channelId: support.channelId } }
    );

    await prisma.supportRequest.delete({
        where: {
            userId: support.userId,
        },
    });

    await redis.del(`cache:support:${support.userId}`);

    await redis.set(`cooldown:support:${message.author.id}`, "t");
    await redis.expire(`cooldown:support:${message.author.id}`, Math.floor(ms("24 hours") / 1000));
}

cmd.setRun(run);

module.exports = cmd;
