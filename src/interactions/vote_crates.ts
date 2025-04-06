import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { addProgress } from "../utils/functions/economy/achievements";
import { calcItemValue, getInventory } from "../utils/functions/economy/inventory";
import { openCrate } from "../utils/functions/economy/loot_pools";
import { addStat } from "../utils/functions/economy/stats";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { getItems, isEcoBanned } from "../utils/functions/economy/utils";
import { getVoteStreak } from "../utils/functions/economy/vote";
import PageManager from "../utils/functions/page";
import { getEmbedColor } from "../utils/functions/premium/color";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

export default {
  name: "vote-crates",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    if (await onCooldown("use", interaction.user.id)) {
      const res = await getResponse("use", interaction.user.id);

      if (res.respond) interaction.reply({ embeds: [res.embed] });
      return;
    }

    await addCooldown("use", interaction.user.id, 7);

    const inventory = await getInventory(interaction.user.id);

    const determineCrateAmount = (value: number) => {
      let amount = 0;

      while (!amount && value >= 0) {
        if (Constants.PROGRESSION.VOTE_CRATE.has(value)) {
          amount = Constants.PROGRESSION.VOTE_CRATE.get(value);
          break;
        }
        value--;
      }

      return amount;
    };

    const crateAmount = determineCrateAmount(await getVoteStreak(interaction.user.id));

    if (
      !inventory.find((i) => i.item === "vote_crate") ||
      inventory.find((i) => i.item === "vote_crate")?.amount < crateAmount
    ) {
      return interaction.reply({
        embeds: [
          new ErrorEmbed(`you do not have ${crateAmount} vote crate${crateAmount != 1 ? "s" : ""}`),
        ],
      });
    }

    await interaction.deferReply();

    const colour = await getEmbedColor(interaction.user.id);

    const embed = new CustomEmbed()
      .setHeader(
        `${interaction.user.username}'s ${crateAmount} vote crate${crateAmount > 1 ? "s" : ""}`,
        interaction.user.avatarURL(),
      )
      .setColor(colour === "default" ? Constants.PURPLE : colour);

    await Promise.all([
      addProgress(interaction.user.id, "unboxer", crateAmount),
      addStat(interaction.user.id, "vote_crate", crateAmount),
      addTaskProgress(interaction.user.id, "open_crates", crateAmount),
    ]);

    const foundAll = {
      money: 0,
      xp: 0,
      karma: 0,
      items: {},
    } as {
      money: number;
      xp: number;
      karma: number;
      items: {
        [item: string]: number;
      };
    };

    for (let i = 0; i < crateAmount; i++) {
      const found = await openCrate(interaction.user.id, getItems()["vote_crate"]);
      for (const product of found) {
        foundAll.money += product.money ?? 0;
        foundAll.xp += product.xp ?? 0;
        foundAll.karma += product.karma ?? 0;
        if (Object.hasOwn(product, "item")) {
          if (Object.hasOwn(foundAll.items, product.item)) {
            foundAll.items[product.item] += product.count ?? 1;
          } else {
            foundAll.items[product.item] = product.count ?? 1;
          }
        }
      }
    }

    const desc: string[] = [];

    desc.push("you found: ");

    if (foundAll.money > 0) {
      desc.push(`- $${foundAll.money.toLocaleString()}`);
    }

    if (foundAll.xp > 0 || foundAll.karma > 0) {
      const xpText = foundAll.xp > 0 ? `+${foundAll.xp.toLocaleString()}xp` : "";
      const karmaText = foundAll.karma > 0 ? `+${foundAll.karma.toLocaleString()}🔮` : "";
      const joiner = foundAll.xp > 0 && foundAll.karma > 0 ? "    " : "";
      embed.setFooter({ text: `${xpText}${joiner}${karmaText}` });
    }

    const values = new Map<string, number>();
    const items = Object.keys(foundAll.items);

    for (const itemKey in foundAll.items) {
      values.set(
        itemKey,
        ((await calcItemValue(itemKey).catch(() => 0)) || 0) * foundAll.items[itemKey],
      );
    }
    inPlaceSort(items).desc((i) => values.get(i));

    for (const item of items) {
      desc.push(
        `- \`${foundAll.items[item]}x\` ${getItems()[item].emoji} ${getItems()[item].name}`,
      );
    }

    const pages = PageManager.createPages(desc, 15);

    embed.setDescription(pages.get(1).join("\n"));

    if (pages.size === 1) {
      return interaction.editReply({ embeds: [embed] });
    } else {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("⬅")
          .setLabel("back")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
      );

      const msg = await interaction.editReply({ embeds: [embed], components: [row] });

      const manager = new PageManager({
        embed,
        message: msg,
        row,
        userId: interaction.user.id,
        pages,
      });

      return manager.listen();
    }
  },
} as InteractionHandler;
