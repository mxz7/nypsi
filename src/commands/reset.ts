import {
  CommandInteraction,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  MessageActionRowComponentBuilder,
  ButtonStyle,
  Interaction,
} from "discord.js";
import {
  getXp,
  getPrestige,
  userExists,
  createUser,
  getMulti,
  getInventory,
  getBalance,
  deleteUser,
  getItems,
} from "../utils/economy/utils.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { addKarma } from "../utils/karma/utils.js";
import { addCooldown, addExpiry, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cmd = new Command("reset", "reset your economy profile to gain karma", Categories.MONEY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  let earnedKarma = 0;

  let inventoryWorth = 0;
  const multi = await getMulti(message.member);

  let inventory = await getInventory(message.member);
  const items = getItems();

  let itemIDs = Array.from(Object.keys(inventory));

  for (const item of itemIDs) {
    if (items[item].sell) {
      const amount = inventory[item];

      if (items[item].role == "fish" || items[item].role == "prey") {
        const worth1 = Math.floor(items[item].sell * amount);
        inventoryWorth += Math.floor(worth1 + worth1 * multi);
      } else {
        inventoryWorth += Math.floor(items[item].sell * 0.95 * amount);
      }
    } else {
      inventoryWorth += 1000;
    }
  }

  earnedKarma += (await getPrestige(message.member)) * 30;
  earnedKarma += (await getXp(message.member)) / 100;
  earnedKarma += (await getBalance(message.member)) / 100000 / 2;
  earnedKarma += inventoryWorth / 100000 / 2;

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
    inventoryWorth = 0;

    inventory = await getInventory(message.member);

    itemIDs = Array.from(Object.keys(inventory));

    for (const item of itemIDs) {
      if (items[item].sell) {
        const amount = inventory[item];

        if (items[item].role == "fish" || items[item].role == "prey") {
          const worth1 = Math.floor(items[item].sell * amount);
          inventoryWorth += Math.floor(worth1 + worth1 * multi);
        } else {
          inventoryWorth += Math.floor(items[item].sell * 0.95 * amount);
        }
      } else {
        inventoryWorth += 1000;
      }
    }

    earnedKarma += (await getPrestige(message.member)) * 30;
    earnedKarma += (await getXp(message.member)) / 100;
    earnedKarma += (await getBalance(message.member)) / 100000 / 2;
    earnedKarma += inventoryWorth / 100000 / 2;

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
