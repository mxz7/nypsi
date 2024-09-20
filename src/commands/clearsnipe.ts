import { Channel, CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { eSnipe, snipe } from "../utils/functions/guilds/utils";

const cmd = new Command("clearsnipe", "delete the current sniped thing", "moderation")
  .setAliases(["cs"])
  .setPermissions(["MANAGE_MESSAGES"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  let channel: Channel = message.channel;

  if (args.length == 1) {
    if (!message.mentions.channels.first()) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
    }
    channel = message.mentions.channels.first();
    if (!channel) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
    }
  }

  if (!snipe || (!snipe.get(channel.id) && (!eSnipe || !eSnipe.get(channel.id)))) {
    return message.channel.send({
      embeds: [new ErrorEmbed("nothing has been sniped in " + channel.toString())],
    });
  }

  snipe.delete(channel.id);
  eSnipe.delete(channel.id);

  return message.channel.send({
    embeds: [new CustomEmbed(message.member, "✅ snipe cleared in " + channel.toString())],
  });
}

cmd.setRun(run);

module.exports = cmd;
