import { CommandInteraction, Message } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import {
  getSupportRequestByChannelId,
  handleAttachments,
  sendToRequestChannel,
  summariseRequest,
  toggleNotify,
} from "../utils/functions/supportrequest";
import { addNotificationToQueue } from "../utils/functions/users/notifications";

const cmd = new Command("reply", "reply to a support ticket", "none");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const support = await getSupportRequestByChannelId(message.channel.id);

  if (!support) return;

  if (!(message instanceof Message)) return;

  if (args.length == 0 && !message.attachments.first()) {
    return message.channel.send({
      embeds: [
        new ErrorEmbed(
          "**auto.scam**\n" +
            "**auto.transfer**\n" +
            "**auto.buyunban**\n" +
            "**notify**\n" +
            "**summary**\n" +
            "<message content>",
        ),
      ],
    });
  }

  const embed = new CustomEmbed(message.member).setHeader(
    message.author.username,
    message.author.avatarURL(),
  );

  if (args.length > 0) {
    if (args[0].toLowerCase() === "auto.scam") {
      embed.setDescription(
        "for scamming the burden is on you to provide evidence and we just verify it and decide if a punishment is worthy\n\n" +
          "you need to clearly show:\n" +
          "- the agreement of terms\n" +
          "- the payment\n" +
          "- the refusal when the terms are met\n\n" +
          "if you're unable to provide sufficient evidence, then unfortunately nothing can be done.\n\n" +
          "*please send evidence in chronological order*",
      );
    } else if (args[0].toLowerCase() === "auto.transfer") {
      embed.setDescription(
        "it sounds like you're asking about a **profile transfer** where data from one account will be applied to another\n\n" +
          "you must provide evidence the old account username and user ID, as well as prove that it is your account\n\n" +
          "if you're unable to prove that it's your account, we cannot do anything.",
      );
    } else if (args[0].toLowerCase() === "auto.buyunban") {
      embed.setDescription(
        "if you are **banned/muted from the nypsi discord server** then you can be unbanned/unmuted by making a custom donation of £20 to https://ko-fi.com/tekoh\n\n" +
          "if you are **banned from nypsi economy** you can buy an unban from https://ko-fi.com/s/1d78b621a5",
      );
    } else if (args[0].toLowerCase() === "notify") {
      const res = await toggleNotify(support.userId, message.author.id);
      if (res) return message.react("✅");
    } else if (args[0].toLowerCase() === "summary") {
      const summary = await summariseRequest(support.userId);

      if (!summary) {
        return message.channel.send({ embeds: [new ErrorEmbed("failed to generate summary")] });
      }

      return message.channel.send({
        embeds: [
          new CustomEmbed()
            .setDescription(summary)
            .setColor(Constants.PURPLE)
            .setHeader("summary", message.client.user.avatarURL()),
        ],
      });
    } else embed.setDescription(args.join(" "));
  }

  if (message.attachments.size > 0) {
    const attachments = await handleAttachments(message.attachments);

    if (attachments === "too big")
      return message.channel.send({
        embeds: [new ErrorEmbed("cannot upload file larger than 100mb")],
      });

    embed.addField("attachments", attachments.join("\n"));
  }

  const job = await addNotificationToQueue({
    payload: {
      content: "you have received a message from your support ticket",
      embed: embed,
    },
    memberId: support.userId,
  }).then((r) => r[0]);

  const interval = setInterval(async () => {
    const state = await job.getState();
    switch (state) {
      case "unknown":
      case "completed":
        clearInterval(interval);
        message.delete();
        sendToRequestChannel(
          support.userId,
          embed,
          message.author.id,
          message.client as NypsiClient,
        );
        break;
      case "failed":
        clearInterval(interval);
        message.reply({ embeds: [new ErrorEmbed("failed to send message")] });
        break;
    }
  }, 500);
}

cmd.setRun(run);

module.exports = cmd;
