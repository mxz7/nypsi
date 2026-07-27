import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { Pet } from "#generated/prisma";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import {
  activatePet,
  deactivatePet,
  getActivePets,
  getPetSlotCount,
  getUserPet,
  getUserPets,
} from "../utils/functions/economy/pets";
import { getItems, getPetsData } from "../utils/functions/economy/utils";

function formatDescription(pet: Pet) {
  const data = getPetsData()[pet.petId];
  const levelIndex = pet.level - 1;
  const chance = data.chance[levelIndex] * 100;
  const bonus = data.target === "farm" ? data.benefit[levelIndex] * 100 : data.benefit[levelIndex];

  return data.description
    .replaceAll("{chance}", chance.toLocaleString())
    .replaceAll("{bonus}", bonus.toLocaleString());
}

async function runPets(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
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

  let selectedPetId: string;

  if (args[0]) {
    const search = args.join(" ").toLowerCase();
    selectedPetId = userPets.find((pet) => {
      const item = getItems()[getPetsData()[pet.petId].item];
      return pet.petId === search || item.name === search || item.aliases?.includes(search);
    })?.petId;

    if (!selectedPetId) {
      return send({ embeds: [new ErrorEmbed("you have not unlocked this pet")] });
    }
  }

  const render = async () => {
    const result = await Promise.all([
      getUserPets(message.member),
      getPetSlotCount(message.member),
    ]);
    userPets = result[0];
    const slots = result[1];
    const activePets = userPets.filter((pet) => pet.active);
    const select = new StringSelectMenuBuilder().setCustomId("pets-select").addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("overview")
        .setValue("overview")
        .setDefault(!selectedPetId),
      ...userPets.map((pet) => {
        const item = getItems()[getPetsData()[pet.petId].item];
        return new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setValue(pet.petId)
          .setEmoji(item.emoji)
          .setDefault(pet.petId === selectedPetId);
      }),
    );
    const navigation = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      select,
    );

    if (!selectedPetId) {
      const activeDescription =
        activePets.length === 0
          ? "*no active pets*"
          : activePets
              .map((pet) => {
                const item = getItems()[getPetsData()[pet.petId].item];
                return `${item.emoji} **${item.name}** (${pet.level})\n- ${formatDescription(pet)}`;
              })
              .join("\n\n");

      return {
        embed: new CustomEmbed(
          message.member,
          `**active pets** ${activePets.length}/${slots}\n\n${activeDescription}`,
        ).setHeader(`${message.author.username}'s pets`, message.author.avatarURL()),
        components: [navigation],
      };
    }

    const pet = userPets.find((entry) => entry.petId === selectedPetId) ?? userPets[0];
    selectedPetId = pet.petId;
    const petData = getPetsData()[pet.petId];
    const item = getItems()[petData.item];
    const nextLevel =
      pet.level < petData.items.length
        ? `\n\`${petData.items[pet.level].toLocaleString()}x\` needed for next level`
        : "\n**max level**";
    const toggle = new ButtonBuilder()
      .setCustomId("pets-toggle")
      .setLabel(pet.active ? "deactivate" : "activate")
      .setStyle(pet.active ? ButtonStyle.Danger : ButtonStyle.Success);

    return {
      embed: new CustomEmbed(
        message.member,
        `${item.emoji} **${item.name}**\n\n` +
          `**level** ${pet.level}/${petData.items.length}\n` +
          `**status** ${pet.active ? "active" : "inactive"}\n` +
          `**effect** ${formatDescription(pet)}\n` +
          `**activations** ${pet.activations.toLocaleString()}` +
          nextLevel +
          `\n\n**active pets** ${activePets.length}/${slots}`,
      ).setHeader(`${message.author.username}'s pets`, message.author.avatarURL()),
      components: [
        navigation,
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
      selectedPetId = interaction.values[0] === "overview" ? undefined : interaction.values[0];
    } else if (interaction.isButton()) {
      try {
        const pet = await getUserPet(message.member, selectedPetId);
        if (pet?.active) {
          await deactivatePet(message.member, selectedPetId);
        } else {
          await activatePet(message.member, selectedPetId);
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "failed to update pet";
        const embed = new ErrorEmbed(messageText);

        if (messageText === "all of your active pet slots are occupied") {
          const activePets = await getActivePets(message.member);
          embed.addField(
            "active pets",
            activePets
              .map((pet) => {
                const item = getItems()[getPetsData()[pet.petId].item];
                return `${item.emoji} ${item.name}`;
              })
              .join("\n"),
          );
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
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
}

const cmd = new Command("pets", "view and manage your pets", "money").setAliases(["pet"]);
cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option
    .setName("pet")
    .setDescription("pet you want to view")
    .setRequired(false)
    .setAutocomplete(true),
);
cmd.setRun(runPets);

module.exports = cmd;
