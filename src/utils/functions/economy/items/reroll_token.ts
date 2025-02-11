import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { randomInt } from "mathjs";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import sleep from "../../sleep";
import { addInventoryItem, getInventory, setInventoryItem } from "../inventory";
import { getUpgrades, setUpgrade } from "../levelling";
import { addStat } from "../stats";
import { getUpgradesData } from "../utils";

module.exports = new ItemUse(
  "reroll_token",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        let usedNewMessage = false;
        let res;

        if (message.deferred) {
          res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        } else {
          res = await message.reply(data as InteractionReplyOptions).catch(() => {
            return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
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

    let [inventory, upgrades] = await Promise.all([
      getInventory(message.member),
      getUpgrades(message.member),
    ]);

    const upgradesData = getUpgradesData();

    if (upgrades.length === 0)
      return send({
        embeds: [
          new ErrorEmbed("you have no upgrades to reroll, you must prestige to receive an upgrade"),
        ],
      });

    if (
      !inventory.find((i) => i.item === "reroll_token") ||
      inventory.find((i) => i.item === "reroll_token").amount < 1
    )
      return send({ embeds: [new ErrorEmbed("you don't have a reroll token")] });

    const embed = new CustomEmbed(
      message.member,
      "which upgrade would you like to reroll?",
    ).setHeader("reroll token", message.author.avatarURL());

    const selectMenu = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
      new StringSelectMenuBuilder()
        .setCustomId("upgrade-list")
        .setOptions(
          upgrades.map((upgrade) => {
            return { label: upgradesData[upgrade.upgradeId].name, value: upgrade.upgradeId };
          }),
        )
        .setPlaceholder("choose an upgrade"),
    );

    const button = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("booobies")
        .setLabel("reroll")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
    );

    const msg = await send({ embeds: [embed], components: [selectMenu, button] });

    const reactionManager: any = async () => {
      const interaction = await msg
        .awaitMessageComponent({
          filter: (i) => i.user.id === message.author.id,
          time: 30000,
        })
        .catch(() => {
          selectMenu.components.forEach((i) => i.setDisabled(true));
          button.components.forEach((i) => i.setDisabled(true));
          (button.components[0] as ButtonBuilder).setStyle(ButtonStyle.Danger).setLabel("expired");
          msg.edit({ components: [selectMenu, button] });
        });

      if (!interaction) return;

      if (interaction.isStringSelectMenu()) {
        (selectMenu.components[0] as StringSelectMenuBuilder).options.forEach((option) => {
          if (option.data.value === interaction.values[0]) option.setDefault(true);
          else option.setDefault(false);
        });
        (button.components[0] as ButtonBuilder).setDisabled(false);

        await interaction.update({ components: [selectMenu, button] });

        return reactionManager();
      } else if (interaction.isButton()) {
        [inventory, upgrades] = await Promise.all([
          getInventory(message.member),
          getUpgrades(message.member),
        ]);

        if (
          !inventory.find((i) => i.item === "reroll_token") ||
          inventory.find((i) => i.item === "reroll_token").amount < 1
        )
          return interaction.reply({ embeds: [new ErrorEmbed("you don't have a reroll token")] });

        const chosen = (selectMenu.components[0] as StringSelectMenuBuilder).options.find(
          (i) => i.data.default,
        ).data.value;

        if (!chosen) return interaction.reply({ embeds: [new ErrorEmbed("invalid upgrade")] });

        if (
          !upgrades.find((i) => i.upgradeId === chosen) ||
          upgrades.find((i) => i.upgradeId === chosen).amount < 1
        )
          return interaction.reply({ embeds: [new ErrorEmbed("sneaky sneaky sneaky")] });

        embed.setDescription(
          `<a:nypsi_reroll_token_spin:1185247632927490069> rerolling **${upgradesData[chosen].name}**...`,
        );

        await interaction.update({ embeds: [embed], components: [] });
        await setUpgrade(
          message.member,
          chosen,
          upgrades.find((i) => i.upgradeId === chosen).amount - 1,
        );
        await setInventoryItem(
          message.member,
          "reroll_token",
          inventory.find((i) => i.item === "reroll_token").amount - 1,
        );
        await addStat(message.member, "reroll_token", 1);

        const upgradesPool: string[] = [];
        let attempts = 0;

        while (upgradesPool.length === 0 && attempts < 100) {
          attempts++;
          for (const upgrade of Object.values(getUpgradesData())) {
            if (
              (upgrades.find((i) => i.upgradeId === upgrade.id) &&
                upgrades.find((i) => i.upgradeId === upgrade.id).amount >= upgrade.max) ||
              upgrade.id === chosen
            )
              continue;

            upgradesPool.push(upgrade.id);
          }
        }

        const selected =
          upgradesPool.length > 0
            ? upgradesPool[Math.floor(Math.random() * upgradesPool.length)]
            : "";

        if (selected) {
          await setUpgrade(
            message.member,
            selected,
            upgrades.find((i) => i.upgradeId === selected)
              ? upgrades.find((i) => i.upgradeId === selected).amount + 1
              : 1,
          );

          embed.setDescription(
            `you rerolled **${upgradesData[chosen].name}** into **${upgradesData[selected].name}**`,
          );
          embed.setColor(Constants.EMBED_SUCCESS_COLOR);
        } else {
          const pieces = randomInt(5, 13);
          embed.setDescription(
            `your reroll token failed and shattered into ${pieces} <:nypsi_gem_shard:1088524343367188510> shards`,
          );
          embed.setColor(Constants.EMBED_FAIL_COLOR);
          await addInventoryItem(message.member, "gem_shard", pieces);
        }

        await sleep(2000);

        return msg.edit({ embeds: [embed] });
      }
    };

    reactionManager();
  },
);
