import {
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Pet } from "#generated/prisma";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomContainer, CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { isUserContentAllowed } from "../utils/functions/ai/moderation";
import { getInventory } from "../utils/functions/economy/inventory";
import {
  PET_NAME_REMOVAL_COST,
  calcPetNameCost,
  isValidPetName,
  removePetName,
  setPetName,
} from "../utils/functions/economy/pet-names";
import {
  activatePet,
  addPet,
  deactivatePet,
  getActivePets,
  getPetDisplayName,
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
      embeds: [new ErrorEmbed("you don't have any pets yet")],
    });
  }

  let selectedPetId: string;

  if (args[0]) {
    const search = args.join(" ").toLowerCase();
    selectedPetId = userPets.find((pet) => {
      const item = getItems()[getPetsData()[pet.petId].item];
      return (
        pet.petId === search ||
        pet.name?.toLowerCase() === search ||
        item.name === search ||
        item.aliases?.includes(search)
      );
    })?.petId;

    if (!selectedPetId) {
      return send({ embeds: [new ErrorEmbed("you have not unlocked this pet")] });
    }
  }

  const render = async (disabled = false) => {
    const [refreshedPets, slots, inventory] = await Promise.all([
      getUserPets(message.member),
      getPetSlotCount(message.member),
      getInventory(message.member),
    ]);
    userPets = refreshedPets;
    const activePets = userPets.filter((pet) => pet.active);

    const select = new StringSelectMenuBuilder()
      .setCustomId("select-pet")
      .setDisabled(disabled)
      .addOptions(
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

    if (!selectedPetId) {
      const activeDescription =
        activePets.length === 0
          ? "*no active pets*"
          : activePets
              .map((pet) => {
                const item = getItems()[getPetsData()[pet.petId].item];
                const name = pet.name ? `\n- **name** ${pet.name}` : "";
                return `${item.emoji} **${item.name}** (${pet.level})${name}\n- ${formatDescription(pet)}`;
              })
              .join("\n\n");

      return new CustomContainer(message.member)
        .addTextDisplayComponents((text) =>
          text.setContent(
            `## ${message.author.username}'s pets\n### active pets (${activePets.length}/${slots})`,
          ),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((text) => text.setContent(activeDescription))
        .addActionRowComponents((row) => row.addComponents(select));
    }

    const pet = userPets.find((entry) => entry.petId === selectedPetId) ?? userPets[0];
    selectedPetId = pet.petId;

    const petData = getPetsData()[pet.petId];
    const item = getItems()[petData.item];

    const requiredItems = petData.items[pet.level];
    const canUpgrade =
      requiredItems !== undefined && inventory.count(petData.item) >= requiredItems;
    const namingCost = calcPetNameCost(userPets.filter((entry) => entry.name).length);
    const nextLevel =
      requiredItems !== undefined
        ? `\n\n\`${requiredItems.toLocaleString()}x\` needed for next level`
        : "\n**max level**";

    const toggle = new ButtonBuilder()
      .setCustomId("btn-pets-toggle")
      .setLabel(pet.active ? "deactivate" : "activate")
      .setStyle(pet.active ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(disabled);
    const levelUp = new ButtonBuilder()
      .setCustomId("btn-pets-level-up")
      .setLabel("level up")
      .setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(disabled || !canUpgrade);
    const name = new ButtonBuilder()
      .setCustomId("btn-pets-name")
      .setLabel(`${pet.name ? "rename" : "name"} ($${namingCost.toLocaleString()})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled);
    const removeName = new ButtonBuilder()
      .setCustomId("btn-pets-remove-name")
      .setLabel(`remove name ($${PET_NAME_REMOVAL_COST.toLocaleString()})`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !pet.name);

    return new CustomContainer(message.member)
      .addTextDisplayComponents((text) =>
        text.setContent(
          `## ${item.emoji} ${item.name}\n` +
            `**name** ${pet.name ?? "not named"}\n` +
            `**level** ${pet.level}/${petData.items.length}\n` +
            `**status** ${pet.active ? "active" : "inactive"}\n` +
            `**effect** ${formatDescription(pet)}\n` +
            `**activations** ${pet.activations.toLocaleString()}` +
            nextLevel,
        ),
      )
      .addSeparatorComponents((separator) => separator)
      .addActionRowComponents((row) => row.addComponents(select))
      .addActionRowComponents((row) => row.addComponents(toggle, levelUp))
      .addActionRowComponents((row) => row.addComponents(name, removeName))
      .addTextDisplayComponents((text) =>
        text.setContent(`-# active pets ${activePets.length}/${slots}`),
      );
  };

  const initial = await render();
  const response = await send({
    components: [initial],
    flags: MessageFlags.IsComponentsV2,
  });

  const collector = response.createMessageComponentCollector({
    filter: (interaction) => interaction.user.id === message.author.id,
    time: 60_000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      selectedPetId = interaction.values[0] === "overview" ? undefined : interaction.values[0];
    } else if (interaction.isButton()) {
      if (interaction.customId === "btn-pets-name") {
        const pet = await getUserPet(message.member, selectedPetId);
        const modal = new ModalBuilder()
          .setCustomId("modal-name-pet")
          .setTitle(`name ${getItems()[getPetsData()[selectedPetId].item].name}`)
          .addLabelComponents(
            new LabelBuilder().setLabel("pet name").setTextInputComponent(
              new TextInputBuilder()
                .setCustomId("name")
                .setPlaceholder(pet?.name ?? "enter a name")
                .setMaxLength(16)
                .setRequired(true)
                .setStyle(TextInputStyle.Short),
            ),
          );

        await interaction.showModal(modal);

        const submission = await interaction
          .awaitModalSubmit({
            filter: (entry) => entry.user.id === message.author.id,
            time: 120_000,
          })
          .catch((): undefined => undefined);

        if (!submission) return;

        const name = submission.fields.getTextInputValue("name").trim();

        if (!isValidPetName(name)) {
          await submission.reply({
            flags: MessageFlags.Ephemeral,
            embeds: [
              new ErrorEmbed(
                "pet names can contain only letters and numbers, with up to 2 words and 16 characters",
              ),
            ],
          });
          return;
        }

        if (
          !(await isUserContentAllowed(name, {
            source: "pet name",
            userId: message.author.id,
          }))
        ) {
          await submission.reply({
            flags: MessageFlags.Ephemeral,
            embeds: [new ErrorEmbed("invalid name")],
          });
          return;
        }

        let namedPet: Pet;

        try {
          namedPet = await setPetName(message.member, selectedPetId, name);
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "failed to name pet";
          await submission.reply({
            flags: MessageFlags.Ephemeral,
            embeds: [new ErrorEmbed(messageText)],
          });
          return;
        }

        await submission.reply({
          flags: MessageFlags.Ephemeral,
          embeds: [new CustomEmbed(message.member, `${getPetDisplayName(namedPet)} is now named`)],
        });
        await response.edit({ components: [await render()] });
        return;
      }

      try {
        if (interaction.customId === "btn-pets-level-up") {
          await addPet(message.member, selectedPetId);
        } else if (interaction.customId === "btn-pets-remove-name") {
          await removePetName(message.member, selectedPetId);
        } else if (interaction.customId === "btn-pets-toggle") {
          const pet = await getUserPet(message.member, selectedPetId);
          if (pet?.active) {
            await deactivatePet(message.member, selectedPetId);
          } else {
            await activatePet(message.member, selectedPetId);
          }
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
                return `${item.emoji} ${getPetDisplayName(pet)}`;
              })
              .join("\n"),
          );
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
    }

    const updated = await render();
    await interaction.update({ components: [updated] });
  });

  collector.on("end", async () => {
    await response
      .edit({
        components: [await render(true)],
        flags: MessageFlags.IsComponentsV2,
      })
      .catch(() => {});
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
