import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { checkMessageContent } from "../utils/functions/guilds/filters";
import { getPrefix } from "../utils/functions/guilds/utils";

const cmd = new Command("chatfilter", "change the chat filter for your server", "admin")
  .setAliases(["filter"])
  .setPermissions(["MANAGE_SERVER"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return send({
        embeds: [new ErrorEmbed("you need the `manage server` permission")],
      });
    }
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  const help = () => {
    const embed = new CustomEmbed(message.member).setHeader("chat filter help");

    embed.setDescription(
      `${prefix}**filter test** *test the chat filter*\n\nyou can use the [web dashboard](https://nypsi.xyz/me/guilds/${message.guildId}?ref=bot-filter) to modify the filter`,
    );

    return send({ embeds: [embed] });
  };

  if (args.length == 0) {
    return help();
  } else if (args[0].toLowerCase() == "test") {
    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed(`${prefix}filter test <text>`)] });
    }
    const content = args.slice(1, args.length).join(" ").toLowerCase().normalize("NFD");
    const check = await checkMessageContent(message.guild, content, false);
    let embed: CustomEmbed | ErrorEmbed;
    if (!check) {
      embed = new CustomEmbed(message.member).setHeader("chat filter test");
      embed.setDescription(`\`${content}\` was filtered`);
    } else {
      embed = new ErrorEmbed(`\`${content}\` was not found in the filter`);
    }

    return send({ embeds: [embed] });
  } else {
    return help();
  }
}

cmd.setRun(run);

module.exports = cmd;
