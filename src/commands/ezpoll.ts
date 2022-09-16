import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("ezpoll", "simple poll builder", Categories.UTILITY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("ezpoll help")
      .addField("usage", `${prefix}ezpoll <choices..>`)
      .addField(
        "help",
        "after creation your message will be deleted and an embed will be created to act as the poll\n" +
          "every word will be an option in the poll, with a maximum of 4 and minimum of two - use _ to have a space"
      )
      .addField("example", `${prefix}ezpoll option1 option2`);

    return message.channel.send({ embeds: [embed] });
  }

  if (args.length < 2) {
    return message.channel.send({ embeds: [new ErrorEmbed("not enough options")] });
  }

  await addCooldown(cmd.name, message.member, 30);

  let choices = "";
  let count = 1;

  for (let option of args) {
    if (count > 4) break;

    option = option.split("_").join(" ");

    if (count == 1) {
      choices = "1️⃣ " + option;
    } else if (count == 2) {
      choices = choices + "\n2️⃣ " + option;
    } else if (count == 3) {
      choices = choices + "\n3️⃣ " + option;
    } else if (count == 4) {
      choices = choices + "\n4️⃣ " + option;
    }

    count++;
  }

  const embed = new CustomEmbed(message.member, choices)
    .setHeader("poll by " + message.member.user.username)
    .setFooter({ text: "use $ezpoll to make a quick poll" })
    .setDescription(choices);

  if (!(message instanceof Message)) return;

  message.channel.send({ embeds: [embed] }).then(async (m) => {
    await message.delete().catch(() => {});

    if (args.length >= 2) {
      await m.react("1️⃣");
      await m.react("2️⃣");
    }

    if (args.length >= 3) await m.react("3️⃣");
    if (args.length >= 4) await m.react("4️⃣");
  });
}

cmd.setRun(run);

module.exports = cmd;
