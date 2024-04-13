import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { sort } from "fast-sort";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import {
  Car,
  addCar,
  addCarUpgrade,
  calcCarCost,
  calcSpeed,
  getCarEmoji,
  getGarage,
  setCarName,
} from "../utils/functions/economy/cars";
import { getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils.js";
import { getEmojiImage } from "../utils/functions/image";
import { cleanString } from "../utils/functions/string";

const filter = ["nig", "fag", "queer", "hitler"];

const cmd = new Command("garage", "view your custom cars", "money");

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  const showCars = async (
    cars: Car[],
    index = 0,
    msg?: Message,
    interaction?: ButtonInteraction | StringSelectMenuInteraction,
    needsUpdate = true,
  ): Promise<any> => {
    const inventory = await getInventory(message.author.id);
    const embed = new CustomEmbed(message.member).setHeader(
      `${message.author.username}'s garage`,
      message.author.avatarURL(),
    );

    const pages: {
      description: string;
      image?: string;
      selectMenuOption: StringSelectMenuOptionBuilder;
      buttonRow: ActionRowBuilder<MessageActionRowComponentBuilder>;
    }[] = [];

    for (const car of cars) {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setLabel("rename")
          .setCustomId("rename"),
      );

      for (const item of Object.values(getItems()).filter((i) => i.role === "car_upgrade")) {
        const button = new ButtonBuilder()
          .setLabel(item.name)
          .setCustomId(`upg-${item.id}`)
          .setStyle(ButtonStyle.Success);

        if (inventory.find((i) => i.item === item.id)) {
          button.setDisabled(false);
        } else {
          button.setDisabled(true);
        }

        row.addComponents(button);
      }
      pages.push({
        selectMenuOption: new StringSelectMenuOptionBuilder().setLabel(car.name).setValue(car.id),
        buttonRow: row,
        image: getEmojiImage(getCarEmoji(car)),
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
      const msgPayload: MessageEditOptions = {
        embeds: [embed],
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("car")
              .setOptions(pages.map((i) => i.selectMenuOption)),
          ),
          pages[index].buttonRow,
        ],
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
        if (interaction.values[0] === "new") return showCars(cars, cars.length, msg, interaction);
        else
          return showCars(
            cars,
            cars.findIndex((car) => car.id === interaction.values[0]),
            msg,
            interaction,
          );
      } else if (interaction.componentType === ComponentType.Button) {
        if (interaction.customId === "new") {
          const balance = await getBalance(message.author.id);
          const cost = calcCarCost((await getGarage(message.author.id)).length);

          if (balance < cost) {
            await interaction.reply({
              ephemeral: true,
              embeds: [new ErrorEmbed("you cannot afford this")],
            });
            return showCars(cars, index, msg, undefined, false);
          }

          await addCar(message.author.id);
          await updateBalance(message.author.id, balance - cost);
          return showCars(await getGarage(message.author.id), index, msg, interaction);
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
              return res.reply({ ephemeral: true, embeds: [new ErrorEmbed("invalid name")] });
            }
          }

          if (name.length > 30)
            return res.reply({ ephemeral: true, embeds: [new ErrorEmbed("invalid name")] });
          if (name.length < 3)
            return res.reply({ ephemeral: true, embeds: [new ErrorEmbed("invalid name")] });

          res.reply({
            ephemeral: true,
            embeds: [new CustomEmbed(message.member, "car name updated")],
          });

          await setCarName(message.author.id, cars[index].id, name);
          return showCars(await getGarage(message.author.id), index, msg);
        } else if (interaction.customId.startsWith("upg-")) {
          const upgrade = interaction.customId.substring(4);
          const inventory = await getInventory(message.author.id);

          if (!inventory.find((i) => i.item === upgrade)) {
            await interaction.reply({
              embeds: [new ErrorEmbed("you don't have this upgrade. sneaky bitch")],
              ephemeral: true,
            });
            return showCars(cars, index, msg, interaction, false);
          }

          await addCarUpgrade(message.author.id, cars[index].id, getItems()[upgrade].upgrades);
          await setInventoryItem(
            message.author.id,
            upgrade,
            inventory.find((i) => i.item === upgrade).amount - 1,
          );

          return showCars(await getGarage(message.author.id), index, msg, interaction);
        }
      }
    };

    return pageManager();
  };

  showCars(await getGarage(message.author.id));
}

cmd.setRun(run);

module.exports = cmd;
