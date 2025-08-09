import { Channel, CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { MStoTime } from "../utils/functions/date";
import { eSnipe } from "../utils/functions/guilds/utils";

const cmd = new Command("esnipe", "snipe the most recently edited message", "fun").setAliases([
  "es",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let channel: Channel = message.channel;

  if (args.length == 1) {
    if (!message.mentions.channels.first()) {
      return send({ embeds: [new ErrorEmbed("invalid channel")] });
    }

    channel = message.mentions.channels.first();

    if (channel.isDMBased()) return;
    if (channel.isThread()) {
      return send({ embeds: [new ErrorEmbed("you cannot do this")] });
    }

    if (!channel.members.find((m) => m.user.id == message.author.id)) {
      return send({ embeds: [new ErrorEmbed("invalid channel")] });
    }

    if (!channel) {
      return send({ embeds: [new ErrorEmbed("invalid channel")] });
    }
  }

  if (!eSnipe || !eSnipe.get(channel.id)) {
    return send({
      embeds: [new ErrorEmbed("nothing to edit snipe in " + channel.toString())],
    });
  }

  let content = eSnipe.get(channel.id).content;

  if (content.split("\n").length > 10) {
    content = content.split("\n").join(".");
  }

  const created = new Date(eSnipe.get(channel.id).createdTimestamp);

  const embed = new CustomEmbed(message.member, content)
    .setHeader(eSnipe.get(channel.id).member, eSnipe.get(channel.id).memberAvatar)
    .setFooter({ text: MStoTime(Date.now() - created.getTime()) + " ago" });

  send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
