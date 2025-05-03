import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  GuildMember,
  MessageActionRowComponentBuilder,
} from "discord.js";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import { LootPoolResult } from "../../../types/LootPool";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { percentChance, shuffle } from "../random";
import { addProgress } from "./achievements";
import { isGem, itemExists } from "./inventory";
import { describeLootPoolResult, giveLootPoolResult, rollLootPool } from "./loot_pools";
import { addStat } from "./stats";
import { addTaskProgress } from "./tasks";
import { getItems, getLootPools } from "./utils";
import ms = require("ms");
import util = require("util");

type AreaCell = {
  clicks: number;
  result: LootPoolResult;
};

export default class ScratchCard {
  private item: Item;
  public area: AreaCell[][];
  private member: GuildMember;
  public remainingClicks: number;
  public won: boolean;
  public state: "playing" | "finished";

  constructor(member: GuildMember, item: Item) {
    this.item = item;
    this.member = member;
    this.remainingClicks = item.clicks;
    this.won = false;
    this.state = "playing";

    setTimeout(() => {
      if (this.state === "playing") {
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, member.user.id);
        logger.warn("scratch still in playing state after 7 minutes - deleting key", this);
      }
    }, ms("7 minutes"));

    return this;
  }

  public async setArea(area?: AreaCell[][]) {
    this.area = area || (await this.createScratchArea(this.item)) || [];

    return this;
  }

  public getButtons(end = false) {
    const items = getItems();

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

    const index = [0, 0];
    for (const row of this.area) {
      const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();
      for (const col of row) {
        const button = new ButtonBuilder().setCustomId(index.join("-"));

        if (col.clicks === 2) {
          button.setDisabled(true);
          button.setStyle(ButtonStyle.Success);
          if (Object.hasOwn(col.result, "item")) {
            button.setEmoji(items[col.result.item].emoji);
          } else if (Object.hasOwn(col.result, "xp")) {
            button.setEmoji("✨");
          } else if (Object.hasOwn(col.result, "money")) {
            button.setEmoji("💰");
          } else if (Object.hasOwn(col.result, "karma")) {
            button.setEmoji("🔮");
          } else {
            button.setLabel("\u200B");
            button.setStyle(ButtonStyle.Danger);
          }
        } else if (col.clicks === 1) {
          button.setDisabled(true);
          button.setStyle(ButtonStyle.Secondary);
          if (end) button.setStyle(ButtonStyle.Danger);
          if (Object.hasOwn(col.result, "item")) {
            button.setEmoji(items[col.result.item].emoji);
          } else if (Object.hasOwn(col.result, "xp")) {
            button.setEmoji("✨");
          } else if (Object.hasOwn(col.result, "money")) {
            button.setEmoji("💰");
          } else if (Object.hasOwn(col.result, "karma")) {
            button.setEmoji("🔮");
          } else {
            button.setLabel("\u200B");
            button.setStyle(ButtonStyle.Danger);
          }
        } else if (end) {
          button.setStyle(ButtonStyle.Secondary);
          button.setDisabled(true);
          if (col.clicks === 2) button.setStyle(ButtonStyle.Success);
          if (col.clicks === 1) button.setStyle(ButtonStyle.Danger);
          if (Object.hasOwn(col.result, "item")) {
            button.setEmoji(items[col.result.item].emoji);
          } else if (Object.hasOwn(col.result, "xp")) {
            button.setEmoji("✨");
          } else if (Object.hasOwn(col.result, "money")) {
            button.setEmoji("💰");
          } else if (Object.hasOwn(col.result, "karma")) {
            button.setEmoji("🔮");
          } else {
            button.setLabel("\u200B");
          }
        } else {
          button.setStyle(ButtonStyle.Secondary);
          button.setLabel("\u200B");
        }

        buttonRow.addComponents(button);

        index[1]++;
      }
      rows.push(buttonRow);
      index[0]++;
      index[1] = 0;
    }

    return rows;
  }

  public async clicked(interaction: ButtonInteraction) {
    if (interaction.customId === "retry") return;
    const [y, x] = interaction.customId.split("-").map((i) => parseInt(i));
    try {
      if (this.area[y][x].clicks === 1) return;
    } catch (e) {
      logger.error(`scratch card weird error meow meow 1`, {
        y: y,
        x: x,
        customId: interaction.customId,
        area: this.area,
      });
      console.error(e);
      console.error(interaction);

      return;
    }
    this.area[y][x].clicks = 1;
    this.remainingClicks--;

    if (Object.keys(this.area[y][x].result).length === 0) return;

    const checkHorizontal = (xCheck = 0, horizontalMatches = 1): boolean => {
      if (horizontalMatches === 3) return true;
      if (x === xCheck) return checkHorizontal(xCheck + 1, horizontalMatches);
      if (this.area[y][xCheck].clicks !== 1) return false;

      if (!util.isDeepStrictEqual(this.area[y][x].result, this.area[y][xCheck].result))
        return false;

      return checkHorizontal(xCheck + 1, horizontalMatches + 1);
    };

    const checkVertical = () => {
      let start = y;

      for (let i = 0; i < 1; i++) {
        if (
          this.area[start - 1] &&
          util.isDeepStrictEqual(this.area[start - 1][x], this.area[y][x])
        ) {
          start--;
          i--;
        }
      }

      for (let i = start; i < start + 3; i++) {
        if (!this.area[i]) return false;
        if (!util.isDeepStrictEqual(this.area[i][x], this.area[y][x])) return false;
      }

      for (let i = start; i < start + 3; i++) {
        this.area[i][x].clicks += 1;
      }

      return true;
    };

    const giveReward = async () => {
      await addProgress(this.member.user.id, "scratchies_pro", 1);
      await addTaskProgress(this.member.user.id, "scratch_cards");
      this.won = true;

      const embed = new CustomEmbed(this.member)
        .setColor(Constants.EMBED_SUCCESS_COLOR)
        .setHeader(
          `${this.member.user.username}'s ${this.item.name}`,
          this.member.user.avatarURL(),
        );

      const prize = this.area[y][x].result;
      await giveLootPoolResult(this.member.user.id, prize);
      embed.setDescription(`you found ${describeLootPoolResult(prize)}!`);

      if (Object.hasOwn(prize, "money")) {
        addStat(this.member, "earned-scratch", prize.money);
      }
      if (Object.hasOwn(prize, "item") && isGem(prize.item)) {
        await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
      }

      setTimeout(() => {
        interaction.followUp({ embeds: [embed] }).catch(() => {});
      }, 500);
      return;
    };

    if (checkHorizontal()) {
      for (let i = 0; i < 3; i++) {
        this.area[y][i].clicks += 1;
      }

      await giveReward();
    } else if (checkVertical()) {
      await giveReward();
    }
  }

  private async createScratchArea(item: Item) {
    if (item.role !== "scratch-card") return false;

    let arr: AreaCell[][] = [];

    for (let i = 0; i < 5; i++) {
      arr[i] = [
        { clicks: 0, result: {} },
        { clicks: 0, result: {} },
        { clicks: 0, result: {} },
      ];
    }

    const items: LootPoolResult[] = [];

    const poolName = Object.keys(item.loot_pools)[0];

    const pool = getLootPools()[poolName];
    const unweightedPool = structuredClone(pool);
    delete unweightedPool.nothing;
    for (const amount in unweightedPool.money) {
      unweightedPool.money[amount] = 100;
    }
    for (const amount in unweightedPool.xp) {
      unweightedPool.xp[amount] = 100;
    }
    for (const amount in unweightedPool.karma) {
      unweightedPool.karma[amount] = 100;
    }
    for (const item in unweightedPool.items) {
      if (typeof unweightedPool.items[item] === "number") {
        unweightedPool.items[item] = 100;
      } else {
        unweightedPool.items[item].weight = 100;
      }
    }

    const excludedItems = async (e: string) =>
      (getItems()[e].unique && (await itemExists(e))) ||
      (isGem(e) && !!(await redis.exists(Constants.redis.nypsi.GEM_GIVEN)));

    let totalCount = 2;
    let createVert = -1;

    if (item.buy) {
      totalCount = 1;

      if (percentChance(50)) {
        totalCount = 0;
        createVert = Math.floor(Math.random() * 4);
      }
    }

    if (item.id.includes("legendary")) totalCount = 3;
    const hCount = Math.floor(Math.random() * totalCount) + 1;

    for (let i = 0; i < hCount; i++) {
      let pos = Math.floor(Math.random() * 5);

      while (hCount === 1 && pos === 2 && createVert != -1) {
        pos = Math.floor(Math.random() * 5);
      }

      const item = await rollLootPool(pool, excludedItems);
      if ((Object.keys(arr[pos][0].result).length !== 0 && pos !== 2) || hCount === 1)
        createVert = pos;
      arr[pos][0].result = item;
      arr[pos][1].result = item;
      arr[pos][2].result = item;
    }

    if (createVert !== -1 && totalCount !== 1) {
      const item = await rollLootPool(pool, excludedItems);
      const x = Math.floor(Math.random() * 3);

      if (createVert > 2) {
        for (let i = 0; i < 3; i++) {
          arr[i][x].result = item;
        }
      } else {
        for (let i = 2; i < 5; i++) {
          arr[i][x].result = item;
        }
      }
    } else {
      arr = shuffle(arr);
    }

    let nothingCount = 0;

    arr.forEach((arr2) =>
      arr2.forEach((i) => (Object.keys(i.result).length === 0 ? nothingCount++ : null)),
    );

    for (let i = 0; i < nothingCount + 7; i++) {
      const index = [Math.floor(Math.random() * 5), Math.floor(Math.random() * 3)];

      if (Object.keys(arr[index[0]][index[1]].result).length === 0) {
        arr[index[0]][index[1]].result = await rollLootPool(unweightedPool, excludedItems);
      }
    }

    return arr;
  }
}
