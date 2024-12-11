import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import {
  addFarmUpgrade,
  deletePlant,
  fertiliseFarm,
  getClaimable,
  getFarm,
  getFarmUpgrades,
  waterFarm,
} from "../utils/functions/economy/farm";
import { createUser, getItems, getPlantsData, getPlantUpgrades, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import _ = require("lodash");
import dayjs = require("dayjs");
import { getInventory, setInventoryItem } from "../utils/functions/economy/inventory";

const cmd = new Command("farm", "view your farms and harvest", "money").setAliases(["fields"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((view) => view.setName("view").setDescription("view your farms"))
  .addSubcommand((claim) =>
    claim.setName("harvest").setDescription("harvest everything from your farm"),
  )
  .addSubcommand((water) => water.setName("water").setDescription("water your plants"))
  .addSubcommand((fertilise) =>
    fertilise.setName("fertilise").setDescription("fertilise your plants"),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  await addCooldown(cmd.name, message.member, 10);

  const farms = await getFarm(message.member);

  if (farms.length === 0) return send({ embeds: [new ErrorEmbed("you don't have any farms")] });

  if (args.length === 0 || args[0].toLowerCase() === "view") {
    const options = new StringSelectMenuBuilder().setCustomId("farm");

    for (const farm of farms) {
      if (options.options.find((i) => i.data.value === farm.plantId)) continue;

      options.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(getPlantsData()[farm.plantId].name)
          .setValue(farm.plantId)
          .setEmoji(getItems()[getPlantsData()[farm.plantId].item].emoji),
      );
    }

    const render = async (plantId: string) => {
      const embed = new CustomEmbed(message.member).setHeader(
        `${message.author.username}'s farm`,
        message.author.avatarURL(),
      );

      options.options.forEach((e) => e.setDefault(false));
      options.options.find((i) => i.data.value === plantId).setDefault(true);

      let growing = 0;
      let healthy = 0;
      let unhealthy = 0;
      let dead = 0;

      let nextGrow = Number.MAX_SAFE_INTEGER;
      const plants = farms.filter((i) => {
        if (i.plantId === plantId) {
          const growTime =
            i.plantedAt.valueOf() + getPlantsData()[plantId].growthTime * 1000 - Date.now();

          if (
            i.fertilisedAt.valueOf() <
              dayjs()
                .subtract(getPlantsData()[plantId].fertilise.dead, "seconds")
                .toDate()
                .valueOf() ||
            i.wateredAt.valueOf() <
              dayjs().subtract(getPlantsData()[plantId].water.dead, "seconds").toDate().valueOf()
          ) {
            dead++;
            deletePlant(i.id);
          } else if (
            i.fertilisedAt.valueOf() <
              dayjs()
                .subtract(getPlantsData()[plantId].fertilise.every * 1.5, "seconds")
                .toDate()
                .valueOf() ||
            i.wateredAt.valueOf() <
              dayjs()
                .subtract(getPlantsData()[plantId].water.every * 1.5, "seconds")
                .toDate()
                .valueOf()
          ) {
            unhealthy++;
          } else if (growTime > 0) {
            growing++;
            if (growTime < nextGrow) nextGrow = growTime;
          } else {
            healthy++;
          }

          return true;
        }
      });

      const ready = await getClaimable(message.member, plantId, false);

      embed.setDescription(
        `${getItems()[getPlantsData()[plantId].item].emoji} **${getPlantsData()[plantId].name}** farm\n\n` +
          `you have **${plants.length.toLocaleString()}** ${plants.length > 1 ? getPlantsData()[plantId].type_plural : getPlantsData()[plantId].type}\n` +
          `${
            growing > 0
              ? `${growing.toLocaleString()} growing (next <t:${dayjs().add(nextGrow, "milliseconds").unix()}:R>)\n`
              : ""
          }` +
          `${dead > 0 ? `${dead.toLocaleString()} dead\n` : ""}` +
          `${unhealthy > 0 ? `${unhealthy.toLocaleString()} unhealthy\n` : ""}` +
          `${healthy > 0 ? `${healthy.toLocaleString()} healthy\n` : ""}` +
          `${ready > 0 ? `\n\`${ready.toLocaleString()}x\` ${getItems()[getPlantsData()[plantId].item].emoji} ${getItems()[getPlantsData()[plantId].item].name} ready for harvest` : ""}`,
      );

      return embed;
    };


    let selected = options.options[0].data.value;

    const renderUpgrades = async (plantId: string) => {
      const embed = new CustomEmbed(message.member).setHeader(
        `${getPlantsData()[plantId].name} upgrades`,
        message.author.avatarURL(),
      );

      const upgrades = getPlantUpgrades();


      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
        new ButtonBuilder().setCustomId("back1").setLabel("back").setStyle(ButtonStyle.Danger)
      );

      const maxRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
        new ButtonBuilder().setCustomId("back2").setLabel("back").setStyle(ButtonStyle.Danger)
      );

      let desc = "";

      const userUpgrades = await getFarmUpgrades(message.member);

      for (const upgradeId of Object.keys(upgrades)) {
        const upgrade = upgrades[upgradeId];

        if (upgrade.for && !upgrade.for.includes(selected)) continue;
  
  
        const owned = userUpgrades.find((u) => u.upgradeId == upgradeId && u.plantId === selected)?.amount || 0;
        const pluralName = upgrade.plural ? upgrade.plural : upgrade.name;


        if (upgrade.type_single) {
          desc += `**${pluralName}** ${owned}/${upgrade.type_single.stack_limit}`;
        } else if (upgrade.type_upgradable) {
          desc += `**${upgrade.name}** ${owned == 0 ? "none" : getItems()[upgrade.type_upgradable.items[owned - 1]].name}`
        }

        const button = new ButtonBuilder()
          .setCustomId(`up-${upgradeId}`)
          .setEmoji("⬆️")
          .setLabel(`add ${upgrade.name}`);
        const maxButton = new ButtonBuilder()
          .setCustomId(`up-${upgradeId}-max`)
          .setEmoji("⏫")
          .setLabel(`add all ${pluralName}`);

        if (owned < upgrade.type_single?.stack_limit || owned < upgrade.type_upgradable?.items.length) {
          button.setStyle(ButtonStyle.Success);
          maxButton.setStyle(ButtonStyle.Success);
        } else {
          button.setStyle(ButtonStyle.Secondary);
          maxButton.setStyle(ButtonStyle.Secondary);
          button.setDisabled(true);
          maxButton.setDisabled(true);
        }
        desc += "\n";

        row.addComponents(button);
        maxRow.addComponents(maxButton);
      }

      embed.setDescription(desc);

      return {embed: embed, rows: [row, maxRow]};
    };

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
      new ButtonBuilder().setCustomId("upg").setLabel("upgrades").setStyle(ButtonStyle.Primary)
    );

    const msg = await send({
      embeds: [await render(options.options[0].data.value)],
      components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(options), row],
    });

    let inUpgradeMenu = false;

    const listen = async () => {
      const interaction = await msg
        .awaitMessageComponent({
          filter: (i) => i.user.id === message.author.id,
          time: 60000,
        })
        .catch(() => {
          options.setDisabled(true);
          msg.edit({
            components: inUpgradeMenu ? [] : [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(options),
            ],
          });
        });

      if (!interaction) return;

      if (interaction.customId === "farm" || interaction.customId.startsWith("back")) {
        if (interaction.isStringSelectMenu()) selected = interaction.values[0];
        const embed = await render(selected);
        inUpgradeMenu = false;
        
        interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(options),
            row,
          ],
        });
        return listen();
      }

      if (interaction.customId === "upg") {
        const { embed, rows } = await renderUpgrades(selected);
        inUpgradeMenu = true;
        await interaction.update({
          embeds: [embed],
          components: rows
        });
        return listen();
      }

      if (interaction.customId.startsWith("up-")) {
        const upgradeId = interaction.customId.split("-")[1];
        const upgrade = getPlantUpgrades()[upgradeId];

        if (upgrade.type_single) {
          const itemCount = (await getInventory(message.member)).find((i) => i.item === upgrade.type_single.item)?.amount || 0;
          const item = getItems()[upgrade.type_single.item];

          if (itemCount === 0) {
            await interaction.reply({
              embeds: [new ErrorEmbed(`you don't have any ${item.plural ? item.plural : item.name}`)],
              ephemeral: true,
            });
            return listen();
          }

          const userUpgradeCount = (await getFarmUpgrades(message.member)).find((u) => u.upgradeId === upgradeId && u.plantId === selected)?.amount || 0;

          if (userUpgradeCount >= upgrade.type_single.stack_limit) {
            await interaction.reply({
              embeds: [new ErrorEmbed(`you already have the max amount of ${item.plural ? item.plural : item.name}`)],
              ephemeral: true,
            });
            return listen();
          }

          let count = 1;

          if (interaction.customId.endsWith("-max")) {
            count = Math.min(itemCount, upgrade.type_single.stack_limit - userUpgradeCount);
          }

          await setInventoryItem(message.member, item.id, itemCount - count);
          await addFarmUpgrade(message.member, selected, upgradeId, count);

          const { embed, rows } = await renderUpgrades(selected);
          await interaction.update({
            embeds: [embed],
            components: rows
          });
        } else if (upgrade.type_upgradable) {
          const userUpgradeLevel = (await getFarmUpgrades(message.member)).find((u) => u.upgradeId === upgradeId && u.plantId === selected)?.amount || 0;
          const nextLevelItem = getItems()[upgrade.type_upgradable.items[userUpgradeLevel]];
          const itemCount = (await getInventory(message.member)).find((i) => i.item === nextLevelItem.id)?.amount || 0;

          if (userUpgradeLevel == upgrade.type_upgradable.items.length) {
            await interaction.reply({
              embeds: [new ErrorEmbed(`you are already at the max level for this upgrade`)],
              ephemeral: true,
            });
            return listen();
          }

          if (itemCount === 0) {
            await interaction.reply({
              embeds: [new ErrorEmbed(`you don't have ${nextLevelItem.article} ${nextLevelItem.name}`)],
              ephemeral: true,
            });
            return listen();
          }

          await setInventoryItem(message.member, nextLevelItem.id, itemCount - 1);
          await addFarmUpgrade(message.member, selected, upgradeId, 1)

          if (interaction.customId.endsWith("-max")) {
            while (userUpgradeLevel < upgrade.type_upgradable.items.length) {
              const userUpgradeLevel = (await getFarmUpgrades(message.member)).find((u) => u.upgradeId === upgradeId && u.plantId === selected)?.amount || 0;
              const nextLevelItem = getItems()[upgrade.type_upgradable.items[userUpgradeLevel]];
              if (!nextLevelItem) break;
              const itemCount = (await getInventory(message.member)).find((i) => i.item === nextLevelItem.id)?.amount || 0;

              if (itemCount === 0) break;

              await setInventoryItem(message.member, nextLevelItem.id, itemCount - 1);
              await addFarmUpgrade(message.member, selected, upgradeId, 1)
            }
          }

          const { embed, rows } = await renderUpgrades(selected);
          await interaction.update({
            embeds: [embed],
            components: rows
          });
        }

        return listen();
      }
    };
    listen();
  } else if (["claim", "harvest"].includes(args[0].toLowerCase())) {
    const promises = [];

    const plantTypes: string[] = [];

    farms.forEach((plant) =>
      plantTypes.includes(plant.plantId) ? null : plantTypes.push(plant.plantId),
    );

    const earned = new Map<string, number>();

    for (const plant of plantTypes) {
      promises.push(
        (async () => {
          const items = await getClaimable(message.member, plant, true);
          if (items > 0) earned.set(plant, items);
        })(),
      );
    }

    await Promise.all(promises);

    if (earned.size === 0) return send({ embeds: [new ErrorEmbed("you have nothing to harvest")] });

    let desc = "you have harvested:\n";

    for (const [plantId, value] of earned.entries()) {
      desc += `\n\`${value.toLocaleString()}x\` ${getItems()[getPlantsData()[plantId].item].emoji} ${getItems()[getPlantsData()[plantId].item].name}`;
    }

    const embed = new CustomEmbed(message.member, desc).setHeader(
      `${message.author.username}'s farm`,
      message.author.avatarURL(),
    );

    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase() === "water") {
    if (farms.length === 0) return send({ embeds: [new ErrorEmbed("you have no plants")] });

    if (await onCooldown(cmd.name + "_water", message.member)) {
      return send({ embeds: [new ErrorEmbed("you have already watered your farm recently")] });
    }

    await addCooldown(cmd.name + "_water", message.member, 3600);

    const res = await waterFarm(message.author.id);

    if (res.count === 0) {
      return send({
        embeds: [
          new ErrorEmbed(
            "none of your plants need water" +
              (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
          ),
        ],
      });
    }

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `✅ you have watered ${res.count} plants` +
            (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
        ),
      ],
    });
  } else if (args[0].toLowerCase() === "fertilise") {
    if (farms.length === 0) return send({ embeds: [new ErrorEmbed("you have no plants")] });

    const res = await fertiliseFarm(message.author.id);

    if (res.msg === "not fertiliser") {
      return send({
        embeds: [
          new ErrorEmbed(
            "you don't have any fertiliser" +
              (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
          ),
        ],
      });
    }

    if (res.done) {
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `✅ you have fertilised ${res.done} plants` +
              (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
          ),
        ],
      });
    }
  }
}

cmd.setRun(run);

module.exports = cmd;
