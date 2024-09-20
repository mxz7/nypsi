import { CommandInteraction, Message } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import requestDM from "../utils/functions/requestdm";
import {
  getSupportRequestByChannelId,
  sendToRequestChannel,
} from "../utils/functions/supportrequest";

const cmd = new Command("reply", "reply to a support ticket", "none");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const support = await getSupportRequestByChannelId(message.channel.id);

  if (!support) return;

  if (!(message instanceof Message)) return;

  if (args.length == 0 && !message.attachments.first()) {
    return message.channel.send({ embeds: [new ErrorEmbed("dumbass")] });
  }

  const embed = new CustomEmbed(message.member).setHeader(
    message.author.username,
    message.author.avatarURL(),
  );

  if (args.length > 0) {
    embed.setDescription(args.join(" "));
  }

  if (message.attachments.first()) {
    embed.setImage(message.attachments.first().url);
  }

  Promise.all([
    sendToRequestChannel(support.userId, embed, message.client as NypsiClient),
    requestDM({
      client: message.client as NypsiClient,
      content: "you have received a message from your support ticket",
      embed: embed,
      memberId: support.userId,
    }),
    message.delete(),
  ]);
}

cmd.setRun(run);

module.exports = cmd;
