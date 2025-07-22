import { Channel, CommandInteraction, GuildMember } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { MStoTime } from "../utils/functions/date";
import { snipe } from "../utils/functions/guilds/utils";

const cmd = new Command("snipe", "snipe the most recently deleted message", "fun").setAliases([
  "s",
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
    if (channel.isThread()) return;

    if (!channel.members.find((m: GuildMember) => m.user.id == message.author.id)) {
      return send({ embeds: [new ErrorEmbed("invalid channel")] });
    }

    if (!channel) {
      return send({ embeds: [new ErrorEmbed("invalid channel")] });
    }
  }

  if (!snipe || !snipe.get(channel.id)) {
    return send({
      embeds: [new ErrorEmbed("nothing to snipe in " + channel.toString())],
    });
  }

  let content = snipe.get(channel.id).content;

  if (content.split("\n").length > 10) {
    content = content.split("\n").join(".");
  }

  const created = new Date(snipe.get(channel.id).createdTimestamp);

  const embed = new CustomEmbed(message.member, content)
    .setHeader(snipe.get(channel.id).member, snipe.get(channel.id).memberAvatar)
    .setFooter({ text: MStoTime(Date.now() - created.getTime()) + " ago" });

  send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
