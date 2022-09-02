import { CommandInteraction, Message } from "discord.js";
import prisma from "../utils/database/database";
import redis from "../utils/database/redis";
import requestDM from "../utils/functions/requestdm";
import { getSupportRequestByChannelId, sendToRequestChannel } from "../utils/functions/supportrequest";
import { NypsiClient } from "../utils/models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import ms = require("ms");

const cmd = new Command("close", "close a support ticket", Categories.ADMIN);

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
