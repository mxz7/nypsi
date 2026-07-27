import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { Command } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import {
  activatePet,
  deactivatePet,
  getPetSlotCount,
  getUserPet,
  getUserPets,
} from "../utils/functions/economy/pets";
import { getItems, getPetsData } from "../utils/functions/economy/utils";

const cmd = new Command("pets", "view and manage your pets", "money");
cmd.slashEnabled = true;

cmd.setRun(async (message, send) => {
  let userPets = await getUserPets(message.member);

  if (userPets.length === 0) {
    return send({
      embeds: [
        new CustomEmbed(message.member, "you have not unlocked any pets").setHeader(
          "pets",
          message.author.avatarURL(),
        ),
      ],
    });
  }

  let selectedPetId = userPets[0].petId;

  const render = async () => {
    userPets = await getUserPets(message.member);
    const pet = userPets.find((entry) => entry.petId === selectedPetId) ?? userPets[0];
    const petData = getPetsData()[pet.petId];
    const item = getItems()[petData.item];
    const levelIndex = pet.level - 1;
    const chance = petData.chance[levelIndex] * 100;
    const bonus =
      petData.target === "farm" ? petData.benefit[levelIndex] * 100 : petData.benefit[levelIndex];
    const description = petData.description
      .replaceAll("{chance}", chance.toLocaleString())
      .replaceAll("{bonus}", bonus.toLocaleString());
    const nextLevel =
      pet.level < petData.items.length
        ? `\n**next level** ${petData.items[pet.level].toLocaleString()}x ${item.emoji} ${item.name}`
        : "\n**next level** max";
    const activeCount = userPets.filter((entry) => entry.active).length;
    const slots = await getPetSlotCount(message.member);

    const embed = new CustomEmbed(
      message.member,
      `${item.emoji} **${item.name}**\n\n` +
        `**level** ${pet.level}/${petData.items.length}\n` +
        `**status** ${pet.active ? "active" : "inactive"}\n` +
        `**effect** ${description}\n` +
        `**activations** ${pet.activations.toLocaleString()}` +
        nextLevel +
        `\n\n**active pets** ${activeCount}/${slots}`,
    ).setHeader(`${message.author.username}'s pets`, message.author.avatarURL());

    const select = new StringSelectMenuBuilder().setCustomId("pets-select").addOptions(
      userPets.map((entry) => {
        const entryItem = getItems()[getPetsData()[entry.petId].item];
        return new StringSelectMenuOptionBuilder()
          .setLabel(entryItem.name)
          .setValue(entry.petId)
          .setEmoji(entryItem.emoji)
          .setDefault(entry.petId === pet.petId);
      }),
    );
    const toggle = new ButtonBuilder()
      .setCustomId("pets-toggle")
      .setLabel(pet.active ? "deactivate" : "activate")
      .setStyle(pet.active ? ButtonStyle.Danger : ButtonStyle.Success);

    return {
      embed,
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(toggle),
      ],
    };
  };

  const initial = await render();
  const response = await send({ embeds: [initial.embed], components: initial.components });
  const collector = response.createMessageComponentCollector({
    filter: (interaction) => interaction.user.id === message.author.id,
    time: 60_000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      selectedPetId = interaction.values[0];
    } else if (interaction.isButton()) {
      try {
        const pet = await getUserPet(message.member, selectedPetId);
        if (pet?.active) {
          await deactivatePet(message.member, selectedPetId);
        } else {
          await activatePet(message.member, selectedPetId);
        }
      } catch (error) {
        await interaction.reply({
          embeds: [new ErrorEmbed(error instanceof Error ? error.message : "failed to update pet")],
          ephemeral: true,
        });
        return;
      }
    }

    const updated = await render();
    await interaction.update({ embeds: [updated.embed], components: updated.components });
  });

  collector.on("end", async () => {
    const updated = await render();
    for (const row of updated.components) {
      for (const component of row.components) component.setDisabled(true);
    }
    await response.edit({ components: updated.components }).catch(() => {});
  });
});

export default cmd;
