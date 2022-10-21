import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { calcNetWorth } from "../utils/functions/economy/balance";
import { getPrestige } from "../utils/functions/economy/prestige";
import { createUser, deleteUser, userExists } from "../utils/functions/economy/utils";
import { getXp } from "../utils/functions/economy/xp";
import { addKarma } from "../utils/functions/karma/karma";
import { addCooldown, addExpiry, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("reset", "reset your economy profile to gain karma", Categories.MONEY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  let earnedKarma = 0;

  earnedKarma += (await calcNetWorth(message.member)) / 1000;
  earnedKarma += (await getPrestige(message.member)) * 100;
  earnedKarma += (await getXp(message.member)) / 50;

  earnedKarma = Math.floor(earnedKarma * 2.2);

  const embed = new CustomEmbed(
    message.member,
    "are you sure you want to reset your economy profile?\n\n" +
      `you will lose **everything**, but you will receive ${earnedKarma.toLocaleString()} karma`
  ).setHeader("reset", message.author.avatarURL());

  await addCooldown(cmd.name, message.member);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("✅").setLabel("do it.").setStyle(ButtonStyle.Success)
  );

  const msg = await message.channel.send({ embeds: [embed], components: [row] });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const reaction = await msg
    .awaitMessageComponent({ filter, time: 15000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      return collected.customId;
    })
    .catch(async () => {
      embed.setDescription("❌ expired");
      await msg.edit({ embeds: [embed], components: [] });
      await addExpiry(cmd.name, message.member, 30);
    });

  if (reaction == "✅") {
    await addExpiry(cmd.name, message.member, 1800);
    earnedKarma = 0;

    earnedKarma += (await calcNetWorth(message.member)) / 1000;
    earnedKarma += (await getPrestige(message.member)) * 100;
    earnedKarma += (await getXp(message.member)) / 50;

    earnedKarma = Math.floor(earnedKarma * 2.2);

    await addKarma(message.member, earnedKarma);

    await deleteUser(message.member);

    embed.setDescription(
      `your economy profile has been reset.\n\nyou have been given **${earnedKarma.toLocaleString()}** karma`
    );

    await msg.edit({ embeds: [embed], components: [] });
  }
}

cmd.setRun(run);

module.exports = cmd;
