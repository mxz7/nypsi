import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("poll", "create a poll with a lot of customisation", Categories.UTILITY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("poll help")
      .addField("usage", `${prefix}poll (choices) <title> | (text)`)
      .addField(
        "help",
        "**<>** required | **()** optional\n" +
          "after creation your message will be deleted and an embed will be created with your text and color if given\n" +
          "if a number isnt found for choices then 👍👎 emojis will be used\n" +
          "largest number of choices is 10, and 1 is minimum"
      )
      .addField("examples", `${prefix}poll question?\n` + `${prefix}poll 2 title | this is a description`);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 45);

  let choices = 0;

  if (parseInt(args[0])) {
    const num = parseInt(args[0]);

    if (num < 2) {
      choices = 0;
    } else if (num > 10) {
      choices = 10;
    } else {
      choices = num;
    }

    if (
      !message.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator) &&
      num > 2
    ) {
      choices = 2;
    }
    args.shift();
  }

  let mode = "";

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed("missing text")] });
  }

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

  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    embed.setHeader(message.member.user.tag);
  }

  if (!(message instanceof Message)) return;

  message.channel.send({ embeds: [embed] }).then(async (m) => {
    await message.delete().catch(() => {});

    if (choices == 0) {
      await m.react("👍");
      await m.react("👎");
    } else if (choices >= 2) {
      await m.react("1️⃣");
      await m.react("2️⃣");
    }

    if (choices >= 3) await m.react("3️⃣");
    if (choices >= 4) await m.react("4️⃣");
    if (choices >= 5) await m.react("5️⃣");
    if (choices >= 6) await m.react("6️⃣");
    if (choices >= 7) await m.react("7️⃣");
    if (choices >= 8) await m.react("8️⃣");
    if (choices >= 9) await m.react("9️⃣");
    if (choices == 10) await m.react("🔟");
  });
}

cmd.setRun(run);

module.exports = cmd;
