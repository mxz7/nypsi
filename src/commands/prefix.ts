import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getPrefix, setPrefix } from "../utils/functions/guilds/utils";

const cmd = new Command("prefix", "change the bot's prefix", "admin").setPermissions([
  "MANAGE_GUILD",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const prefix = await getPrefix(message.guild);

  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.channel.send({
        embeds: [new ErrorEmbed("you need the `manage server` permission")],
      });
    }
    return;
  }

  if (args[0]?.toLowerCase() === "add") {
    if (prefix.length >= 5)
      return message.channel.send({ embeds: [new ErrorEmbed("you can have a max of 5 prefixes")] });

    if (args.length === 1)
      return message.channel.send({
        content:
          "are you actually stupid?? like what prefix do you want to add. nothing? fucking idiot.",
      });

    if (args[1].length > 3)
      return message.channel.send({
        embeds: [new ErrorEmbed("prefix cannot be longer than 3 characters")],
      });

    if (args[1].includes("`") || args[1].includes("*") || args[1].includes("_"))
      return message.channel.send({
        embeds: [new ErrorEmbed("prefix includes illegal character")],
      });

    prefix.push(args[1]);

    await setPrefix(message.guild, prefix);

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, `added \`${args[1]}\` as a prefix`)],
    });
  } else if (args[0]?.toLowerCase() === "del") {
    if (prefix.length === 1)
      return message.channel.send({
        embeds: [new ErrorEmbed("are you really trying to remove your ONLY prefix???")],
      });

    if (args.length === 1)
      return message.channel.send({
        content:
          "are you actually stupid?? like what prefix do you want to remove. nothing? fucking idiot.",
      });

    const index = prefix.findIndex((i) => i === args[1]);

    if (index < 0)
      return message.channel.send({ embeds: [new ErrorEmbed("couldnt find that prefix")] });

    prefix.splice(index, 1);

    await setPrefix(message.guild, prefix);

    return message.channel.send({ embeds: [new CustomEmbed(message.member, "✅ removed")] });
  } else {
    const embed = new CustomEmbed(
      message.member,
      "current prefixes: \n" +
        prefix.map((i) => "`" + i + "`").join("\n") +
        `\n\n${prefix[0]}**prefix add <prefix>** *add a prefix*\n` +
        `${prefix[0]}**prefix del <prefix>** *remove a prefix*`,
    ).setHeader("prefix", message.guild.iconURL());

    return message.channel.send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
