import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { sort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { getBalance, removeBalance } from "../utils/functions/economy/balance";
import {
  Car,
  addCar,
  addCarUpgrade,
  calcCarCost,
  calcSpeed,
  checkSkins,
  getCarEmoji,
  getGarage,
  setCarName,
  setSkin,
} from "../utils/functions/economy/cars";
import { getInventory, removeInventoryItem } from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils.js";
import { getEmojiImage } from "../utils/functions/image";
import sleep from "../utils/functions/sleep";
import { cleanString } from "../utils/functions/string";

const filter = ["nig", "fag", "queer", "hitler"];

const cmd = new Command("garage", "view your custom cars", "money");

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const showCars = async (
    cars: Car[],
    index = 0,
    msg?: Message,
    interaction?: ButtonInteraction | StringSelectMenuInteraction,
    needsUpdate = true,
  ): Promise<any> => {
    const inventory = await getInventory(message.member);
    const embed = new CustomEmbed(message.member).setHeader(
      `${message.author.username}'s garage`,
      message.author.avatarURL(),
    );

    const pages: {
      description: string;
      image?: string;
      selectMenuOption: StringSelectMenuOptionBuilder;
      buttonRow: ActionRowBuilder<MessageActionRowComponentBuilder>;
      skinsRow?: StringSelectMenuBuilder;
    }[] = [];

    for (const car of cars) {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setLabel("rename")
          .setCustomId("rename"),
      );

      const skinItems = inventory.entries.filter((i) => getItems()[i.item].role === "car_skin");
      const skinOptions: { value: string; label: string; emoji: string; default: boolean }[] =
        skinItems.map((i) => ({
          value: i.item,
          label: getItems()[i.item].name,
          emoji: getItems()[i.item].emoji,
          default: car.skin === i.item,
        }));

      for (const item of Object.values(getItems()).filter((i) => i.role === "car_upgrade")) {
        const button = new ButtonBuilder()
          .setLabel(item.name)
          .setCustomId(`upg-${item.id}`)
          .setStyle(ButtonStyle.Success);

        if (inventory.has(item.id)) {
          button.setDisabled(false);
        } else {
          button.setDisabled(true);
        }

        row.addComponents(button);
      }
      pages.push({
        selectMenuOption: new StringSelectMenuOptionBuilder()
          .setLabel(car.name)
          .setValue(car.id.toString())
          .setEmoji(getCarEmoji(car)),
        buttonRow: row,
        image: getEmojiImage(getCarEmoji(car)),
        skinsRow:
          skinOptions.length > 0
            ? new StringSelectMenuBuilder()
                .setOptions({ value: "none", label: "no skin", default: !car.skin }, ...skinOptions)
                .setCustomId("skin")
            : undefined,
        description:
          `**name** ${car.name}\n` +
          `**speed** ${calcSpeed(car)}\n\n` +
          sort(car.upgrades)
            .asc((u) => u.type)
            .map((upgrade) => `**${upgrade.type}** ${upgrade.amount}`)
            .join("\n"),
      });
    }

    if (pages.length < 10) {
      pages.push({
        buttonRow: new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Success)
            .setLabel(`buy car ($${calcCarCost(cars.length).toLocaleString()})`)
            .setCustomId("buy"),
        ),
        selectMenuOption: new StringSelectMenuOptionBuilder().setLabel("new car").setValue("new"),
        description: `you can buy a custom car for $${calcCarCost(cars.length).toLocaleString()}`,
      });
    }

    embed.setDescription(pages[index].description);
    if (pages[index].image) embed.setImage(pages[index].image);
    pages[index].selectMenuOption.setDefault(true);

    if (needsUpdate) {
      const components = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("car")
            .setOptions(pages.map((i) => i.selectMenuOption)),
        ),
        pages[index].buttonRow,
      ];

      if (pages[index].skinsRow)
        components.push(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
            pages[index].skinsRow,
          ),
        );

      const msgPayload: MessageEditOptions = {
        embeds: [embed],
        components,
      };

      if (interaction) {
        msg = await interaction
          .update(msgPayload)
          .then((r) => r.fetch())
          .catch(() => msg.edit(msgPayload));
      } else if (msg) {
        msg = await msg.edit(msgPayload);
      } else {
        msg = await send(msgPayload);
      }
    }

    const pageManager = async (): Promise<any> => {
      const interaction = await msg
        .awaitMessageComponent({ filter: (i) => i.user.id === message.author.id, time: 30000 })
        .catch(() => {});

      if (!interaction) {
        return msg.edit({ components: [] });
      }

      if (interaction.componentType === ComponentType.StringSelect) {
        if (interaction.customId === "car") {
          if (interaction.values[0] === "new") return showCars(cars, cars.length, msg, interaction);
          else
            return showCars(
              cars,
              cars.findIndex((car) => car.id.toString() === interaction.values[0]),
              msg,
              interaction,
            );
        } else if (interaction.customId === "skin") {
          const chosen = interaction.values[0];

          await setSkin(message.member, cars[index].id, chosen === "none" ? undefined : chosen);

          const changed = await checkSkins(message.member, await getGarage(message.member));

          showCars(await getGarage(message.member), index, msg, interaction, true);

          if (changed) {
            await sleep(1000);
            if (interaction.replied || interaction.deferred) {
              interaction.followUp({
                flags: MessageFlags.Ephemeral,
                embeds: [
                  new CustomEmbed(
                    message.member,
                    "the skin was removed from one of your other cars",
                  ),
                ],
              });
            }
          }
        }
      } else if (interaction.componentType === ComponentType.Button) {
        if (interaction.customId === "buy") {
          const balance = await getBalance(message.member);
          const cost = calcCarCost((await getGarage(message.member)).length);

          if (balance < cost) {
            await interaction.reply({
              flags: MessageFlags.Ephemeral,
              embeds: [new ErrorEmbed("you cannot afford this")],
            });
            return showCars(cars, index, msg, undefined, false);
          }

          await addCar(message.member);
          await removeBalance(message.member, cost);
          addStat(message.member, "spent-garage", cost);
          return showCars(await getGarage(message.member), index, msg, interaction);
        } else if (interaction.customId === "rename") {
          const modal = new ModalBuilder()
            .setCustomId("rename_modal")
            .setTitle(`rename ${cars[index].name}`)
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("name")
                  .setLabel("new car name")
                  .setPlaceholder(cars[index].name)
                  .setRequired(true)
                  .setStyle(TextInputStyle.Short),
              ),
            );

          await interaction.showModal(modal);

          const res = await interaction
            .awaitModalSubmit({ filter: (i) => i.user.id === message.author.id, time: 120000 })
            .catch(() => {});

          if (!res) return;
          if (!res.isModalSubmit()) return;

          const name = res.fields.fields.first().value;

          for (const word of filter) {
            if (cleanString(name).includes(word)) {
              return res.reply({
                flags: MessageFlags.Ephemeral,
                embeds: [new ErrorEmbed("invalid name")],
              });
            }
          }

          if (name.length > 30)
            return res.reply({
              flags: MessageFlags.Ephemeral,
              embeds: [new ErrorEmbed("invalid name")],
            });
          if (name.length < 3)
            return res.reply({
              flags: MessageFlags.Ephemeral,
              embeds: [new ErrorEmbed("invalid name")],
            });

          res.reply({
            flags: MessageFlags.Ephemeral,
            embeds: [new CustomEmbed(message.member, "car name updated")],
          });

          await setCarName(message.member, cars[index].id, name);
          return showCars(await getGarage(message.member), index, msg);
        } else if (interaction.customId.startsWith("upg-")) {
          const upgrade = interaction.customId.substring(4);
          const inventory = await getInventory(message.member);

          if (!inventory.has(upgrade)) {
            await interaction.reply({
              embeds: [new ErrorEmbed("you don't have this upgrade. sneaky bitch")],
              flags: MessageFlags.Ephemeral,
            });
            return showCars(cars, index, msg, interaction, false);
          }

          addProgress(message.member, "mechanic", 1);
          await addCarUpgrade(message.member, cars[index].id, getItems()[upgrade].upgrades);
          await removeInventoryItem(message.member, upgrade, 1);

          return showCars(await getGarage(message.member), index, msg, interaction);
        }
      }
    };

    return pageManager();
  };

  showCars(await getGarage(message.member));
}

cmd.setRun(run);

module.exports = cmd;
