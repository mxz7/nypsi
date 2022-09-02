import { CommandInteraction, Message } from "discord.js";
import requestDM from "../utils/functions/requestdm";
import { getSupportRequestByChannelId, sendToRequestChannel } from "../utils/functions/supportrequest";
import { NypsiClient } from "../utils/models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("reply", "reply to a support ticket", Categories.ADMIN);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const support = await getSupportRequestByChannelId(message.channel.id);

    if (!support) return;

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("dumbass")] });
    }

    const embed = new CustomEmbed(message.member)
        .setDescription(args.join(" "))
        .setHeader(message.author.tag, message.author.avatarURL());

    await sendToRequestChannel(support.userId, embed, message.client as NypsiClient);
    await requestDM({
        client: message.client as NypsiClient,
        content: "you have received a message from your support ticket",
        embed: embed,
        memberId: support.userId,
    });
}

cmd.setRun(run);

module.exports = cmd;
