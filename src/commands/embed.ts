import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";

const cmd = new Command("embed", "create an embed message", "utility").setPermissions([
  "MANAGE_MESSAGES",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("embed help")
      .addField("usage", `${prefix}embed <title> | (text) | (hex color)`)
      .addField(
        "help",
        "with this command you can create a simple embed message\n" +
          "**<>** required | **()** optional\n",
      )
      .addField(
        "examples",
        `${prefix}embed hello\n` +
          `${prefix}embed hello | this is a description\n` +
          `${prefix}embed hello | this is a description | #13c696`,
      );

    return message.channel.send({ embeds: [embed] });
  }

  let mode = "";

  if (!message.content.includes("|")) {
    mode = "title_only";
  } else if (args.join(" ").split("|").length == 2) {
    mode = "title_desc";
  }

  const title = args.join(" ").split("|")[0];
  let description;

  if (mode.includes("desc")) {
    description = args.join(" ").split("|")[1];
  }

  const embed = new CustomEmbed(message.member).setTitle(title);

  if (mode.includes("desc")) {
    embed.setDescription(description);
  }

  if (!(message instanceof Message)) return;

  if (message.author.id != Constants.TEKOH_ID)
    embed.setFooter({ text: `sent by: ${message.author.username}` });

  message.channel
    .send({ embeds: [embed] })
    .then(() => {
      message.delete();
    })
    .catch((e) => {
      message.channel.send({ embeds: [new ErrorEmbed(e)] });
    });
}

cmd.setRun(run);

module.exports = cmd;
