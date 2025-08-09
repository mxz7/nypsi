import {
  ActionRowBuilder,
  APIInteractionGuildMember,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { min } from "mathjs";
import { NypsiClient } from "../../../models/Client";
import { NypsiCommandInteraction, NypsiMessage, SendMessage } from "../../../models/Command";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import { KarmaShopItem } from "../../../types/Karmashop";
import { LootPool } from "../../../types/LootPool";
import Constants from "../../Constants";
import { MStoTime } from "../date";
import { getEmojiImage } from "../image";
import { pluralize } from "../string";
import { getSellMulti } from "./balance";
import { calcItemValue, getInventory, getTotalAmountOfItem, Inventory, isGem } from "./inventory";
import { getItemCount, getItemWeight, getTotalWeight } from "./loot_pools";
import { countItemOnMarket } from "./market";
import { getBaseWorkers, getItems, getLootPools, getPlantsData } from "./utils";

const rarities = [
  "common",
  "uncommon",
  "rare",
  "very rare",
  "exotic",
  "impossible",
  "more impossible",
  "even more impossible", // 7
];

const karmashop = require("../../../../data/karmashop.json") as { [key: string]: KarmaShopItem };

type ItemMessageMember = GuildMember | (GuildMember & APIInteractionGuildMember);
type ItemMessageData = {
  embed: CustomEmbed | CustomEmbed[];
  subEmbeds?: { [subTab: string]: CustomEmbed | CustomEmbed[] };
  subTabs?: StringSelectMenuOptionBuilder[];
  widgets?: ActionRowBuilder<MessageActionRowComponentBuilder>;
};

export async function runItemInfo(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
  selected: Item,
  defaultTab: string,
  send?: SendMessage,
): Promise<boolean> {
  send ??= async (data: BaseMessageOptions | InteractionReplyOptions) => {
    return await message.channel.send(data as BaseMessageOptions);
  };

  const tabs: { [tab: string]: ItemMessageData } = {};
  const metaTabs: StringSelectMenuOptionBuilder[] = [];

  const [total, inMarket, value, sellMulti, inventory] = await Promise.all([
    getTotalAmountOfItem(selected.id),
    countItemOnMarket(selected.id, "sell"),
    calcItemValue(selected.id),
    getSellMulti(message.author, message.client as NypsiClient),
    getInventory(message.member),
  ]);

  // =====vvvvv===== MESSAGE DATA =====vvvvv=====

  // economy
  tabs["general"] = getGeneralMessage(
    selected,
    message.member,
    total,
    inMarket,
    value,
    sellMulti.multi,
  );
  metaTabs.push(new StringSelectMenuOptionBuilder().setLabel("general").setValue("general"));

  // obtaining
  tabs["obtaining"] = getObtainingMessage(selected, message.member);
  metaTabs.push(new StringSelectMenuOptionBuilder().setLabel("obtaining").setValue("obtaining"));

  // crafting
  const ingredientIn: string[] = [];
  for (const item of Object.values(getItems())) {
    if (item.craft === undefined) {
      continue;
    }
    if (item.craft.ingredients.map((i) => i.split(":")[0]).includes(selected.id)) {
      ingredientIn.push(item.id);
    }
  }
  if (
    (selected.craft !== undefined && selected.craft.ingredients.length > 0) ||
    ingredientIn.length > 0
  ) {
    tabs["crafting"] = getCraftingMessage(selected, message.member, ingredientIn);
    metaTabs.push(new StringSelectMenuOptionBuilder().setLabel("crafting").setValue("crafting"));
  }

  // booster
  if (selected.role === "booster") {
    tabs["booster_stats"] = getBoosterMessage(selected, message.member);
    metaTabs.push(
      new StringSelectMenuOptionBuilder().setLabel("booster stats").setValue("booster_stats"),
    );
  }

  // loot pools
  if (selected.loot_pools || selected.id === "rain") {
    tabs["loot_pools"] = getLootPoolsMessage(selected, message.member);
    metaTabs.push(
      new StringSelectMenuOptionBuilder().setLabel("loot pools").setValue("loot_pools"),
    );
  }

  // seed stats
  if (selected.role === "seed") {
    tabs["seed_stats"] = getSeedStatsMessage(selected, message.member, sellMulti.multi);
    metaTabs.push(
      new StringSelectMenuOptionBuilder().setLabel("seed stats").setValue("seed_stats"),
    );
  }

  // =====^^^^^===== MESSAGE DATA =====^^^^^=====

  // tab selector
  for (const tab of metaTabs) {
    tab.setDefault(tab.data.value === defaultTab);
  }
  if (tabs[defaultTab] === undefined) {
    return false;
  }

  // format the message
  const formatEmbed = (
    embeds: CustomEmbed | CustomEmbed[],
    inventory: Inventory,
    selected: Item,
  ) => {
    let targets = embeds;
    targets = targets instanceof Array ? targets : [targets];
    for (const target of targets) {
      target
        .setTitle(`${selected.emoji} ${selected.name}`)
        .setThumbnail(getEmojiImage(selected.emoji))
        .disableFooter();
      if (inventory.has(selected.id)) {
        target.setFooter({
          text: `you have ${inventory.count(selected.id).toLocaleString()} ${pluralize(
            selected,
            inventory.count(selected.id),
          )}`,
        });
      }
    }
  };

  for (const tab in tabs) {
    formatEmbed(tabs[tab].embed, inventory, selected);
    for (const subTab in tabs[tab].subEmbeds ?? {}) {
      formatEmbed(tabs[tab].subEmbeds[subTab], inventory, selected);
    }
  }

  // logic
  const showItemMeta = async (
    msg?: Message,
    res?: StringSelectMenuInteraction,
  ): Promise<{ buttonRow: any; embed: any }> => {
    const showItemPage = async (tabName: string, subTab?: string, page?: number) => {
      for (const tab of metaTabs) {
        tab.setDefault(tab.data.value === tabName);
      }
      if (tabs[tabName].subTabs !== undefined) {
        for (const tab of tabs[tabName].subTabs) {
          tab.setDefault(tab.data.value === subTab);
        }
      }

      const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId("tabs").setOptions(metaTabs),
        ),
      );
      if (tabs[tabName].subTabs !== undefined) {
        rows.push(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId("subtabs").setOptions(tabs[tabName].subTabs),
          ),
        );
      }

      let target = subTab === undefined ? tabs[tabName].embed : tabs[tabName].subEmbeds[subTab];
      if (target instanceof Array) {
        if (target.length > 1) {
          rows.push(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled((page ?? 0) <= 0),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled((page ?? 0) >= target.length - 1),
            ),
          );
        }
        target = target[page ?? 0];
      }
      if (tabs[tabName].widgets !== undefined) {
        rows.push(tabs[tabName].widgets);
      }
      return { embed: target, widgetRows: rows };
    };

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async (tabName: string, subTab?: string, page?: number) => {
      const res = await msg
        .awaitMessageComponent({ filter, time: 30_000 })
        .then(async (i) => {
          setTimeout(() => {
            if (!i.deferred && !i.replied) i.deferUpdate().catch(() => {});
          }, 2000);

          return i;
        })
        .catch(() => {});

      if (!res) {
        msg.edit({ components: [] });
        return;
      }

      let targetTab = tabName;
      let targetSub = subTab;
      let targetPage = page;
      if (res.isButton() && ["⬅", "➡"].includes(res.customId)) {
        targetPage = (page ?? 0) + +(res.customId === "➡") - +(res.customId === "⬅");
      }
      if (res.isStringSelectMenu() && res.customId === "subtabs") {
        targetSub = res.values[0];
        targetPage = undefined;
      }
      if (res.isStringSelectMenu() && res.customId === "tabs") {
        targetTab = res.values[0];
        targetSub = undefined;
        targetPage = undefined;
      }

      const { embed, widgetRows } = await showItemPage(targetTab, targetSub, targetPage);
      await res
        .update({ embeds: [embed], components: widgetRows })
        .catch(() => res.message.edit({ embeds: [embed], components: widgetRows }));
      return pageManager(targetTab, targetSub, targetPage);
    };

    const { embed, widgetRows } = await showItemPage(defaultTab);
    const messageUpdateParams = { embeds: [embed], components: widgetRows };

    if (res) {
      await res.update(messageUpdateParams).catch(() => msg.edit(messageUpdateParams));
    } else if (msg) {
      msg = await msg.edit(messageUpdateParams);
    } else {
      msg = await send(messageUpdateParams);
    }

    return pageManager(defaultTab);
  };

  showItemMeta();
  return true;
}

// HELPERS

function getGeneralMessage(
  selected: Item,
  member: ItemMessageMember,
  total: number,
  inMarket: number,
  value: number,
  sellMulti: number,
): ItemMessageData {
  const embed = new CustomEmbed(member);
  const description: string[] = [
    `[\`${selected.id}\`](https://nypsi.xyz/items/${selected.id}?ref=bot-item)`,
  ];
  if (selected.unique) {
    description.push("*unique*");
  }
  description.push(`\n> ${selected.longDesc}\n`);
  if (selected.booster_desc !== undefined) {
    description.push(`*${selected.booster_desc}*\n`);
  }
  if (selected.aliases) {
    description.push(`**aliases** \`${selected.aliases.join("`, `")}\`\n`);
  }
  if (selected.buy) {
    description.push(`**buy** $${selected.buy.toLocaleString()}`);
  }
  if (selected.sell) {
    description.push(`**sell** $${selected.sell.toLocaleString()}`);
    if (["sellable", "prey", "fish"].includes(selected.role)) {
      description[description.length - 1] = description[description.length - 1].concat(
        ` (+**${Math.round(sellMulti * 100)}**% bonus = `,
        `$${Math.floor(selected.sell + selected.sell * sellMulti).toLocaleString()})`,
      );
    }
  }
  if (selected.account_locked) {
    description.push("**account locked**");
  } else {
    description.push(
      `**worth** ${value ? `$${Math.floor(value).toLocaleString()}` : "[unvalued](https://nypsi.xyz/docs/economy/items/worth?ref=bot-item#unvalued)"}`,
    );
    if (total && selected.id !== "lottery_ticket") {
      description.push(`\n**in world** ${total.toLocaleString()}`);
    }
    if (inMarket) {
      description.push(`**in market** ${inMarket.toLocaleString()}`);
    }
    if (
      typeof selected.rarity === "number" &&
      selected.rarity >= 0 &&
      selected.rarity < rarities.length
    ) {
      description.push(`\n**rarity** ${rarities[selected.rarity]} (${selected.rarity})`);
    }

    if (selected.role) {
      description.push(`\n**role** ${selected.role}`);

      let roleDescription = "";
      if (selected.role === "booster") {
        roleDescription = `you can activate your booster with **/use <booster>**`;
      }
      if (["collectable", "flower", "cat"].includes(selected.role)) {
        roleDescription =
          "collectables don't do anything, they're just *collectables*. if you dont want them, you can get rid of them by selling them";
      }
      if (["sellable", "prey", "fish"].includes(selected.role)) {
        roleDescription = `this item is just meant to be sold. you can use the **/sell all** command to do so quickly`;
      }
      if (selected.role === "car") {
        description.push(`**speed** ${selected.speed}`);
        roleDescription = `cars are used for races (**/race**)`;
      }
      if (roleDescription.length) description.push(`\n${roleDescription}`);
    }
  }
  return {
    embed: embed.setDescription(description.join("\n")),
    widgets: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("leaderboard")
        .setEmoji("🏆")
        .setURL(`https://nypsi.xyz/leaderboards/${selected.id}?ref=bot-item`),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("history")
        .setEmoji("📈")
        .setURL(`https://nypsi.xyz/items/history/${selected.id}?ref=bot-item`),
    ),
  };
}

function isOnStore(itemId: string) {
  for (const [id, product] of Constants.KOFI_PRODUCTS) {
    if (product.name == itemId) {
      return { storeId: id };
    }
  }
  return false;
}

function getObtainingMessage(selected: Item, member: ItemMessageMember): ItemMessageData {
  const embed = new CustomEmbed(member);
  const description: string[] = [];
  const workersDescription: string[] = [];
  const farmDescription: string[] = [];
  const poolsDescription: Map<string, number> = new Map<string, number>();
  const items = getItems();
  const lootPools = getLootPools();
  const workers = getBaseWorkers();
  const plants = getPlantsData();
  const onStore = isOnStore(selected.id);
  if (selected.buy) {
    description.push("💰 shop");
  }
  if (onStore) {
    description.push(`💰 [nypsi store](https://ko-fi.com/s/${onStore.storeId})`);
  }
  if (
    Object.values(karmashop)
      .filter((i) => i.type === "item")
      .map((i) => i.value)
      .includes(selected.id)
  ) {
    description.push("🔮 karma shop");
  }
  if (selected.craft) {
    description.push("<:Craft:615426524862087191> crafting");
  }
  if (["vote_crate", "lottery_ticket"].includes(selected.id)) {
    description.push(
      "<:topgg:1355915569286610964> [voting](https://top.gg/bot/678711738845102087/vote)",
    );
  }
  if (["daily_scratch_card", "basic_crate", "nypsi_crate", "gem_crate"].includes(selected.id)) {
    description.push("📅 streak");
  }
  if (["cookie", "cake"].includes(selected.id)) {
    description.push("🧁 baking");
  }
  if (selected.id === "broken_ring") {
    description.push(`${selected.emoji} divorce`);
  }
  const mineItems = [
    "cobblestone",
    "coal",
    "diamond",
    "amethyst",
    "emerald",
    "iron_ore",
    "gold_ore",
    "obsidian",
    "mineshaft_chest",
  ];
  if (mineItems.includes(selected.id) || selected.id === "stick") {
    description.push(
      "<:iron_pickaxe:1354809169198186607> mining ([odds](https://github.com/mxz7/nypsi-odds/))",
    );
  }
  if (["netherrack", "ancient_debris", "quartz", "gold_nugget", "stick"].includes(selected.id)) {
    description.push(
      "<:iron_pickaxe:1354809169198186607> mining in the nether ([odds](https://github.com/mxz7/nypsi-odds/))",
    );
  }
  if (["end_stone", "purpur", "obsidian", "dragon_egg", "chorus", "stick"].includes(selected.id)) {
    description.push(
      "<:iron_pickaxe:1354809169198186607> mining in the end ([odds](https://github.com/mxz7/nypsi-odds/))",
    );
  }
  if (selected.role === "prey") {
    if (["blaze", "wither_skeleton", "piglin", "ghast"].includes(selected.id)) {
      description.push("🔫 hunting in the nether ([odds](https://github.com/mxz7/nypsi-odds/))");
    } else {
      description.push("🔫 hunting ([odds](https://github.com/mxz7/nypsi-odds/))");
    }
  }
  if (
    !["booster", "car", "tool", "prey", "sellable", "ore"].includes(selected.role) &&
    selected.rarity <= 4 &&
    !mineItems.includes(selected.id) &&
    !selected.id.includes("credit") &&
    selected.id !== "crystal_heart"
  ) {
    description.push("🎣 fishing ([odds](https://github.com/mxz7/nypsi-odds/))");
  }
  if (isGem(selected.id) || selected.id === "gem_shard") {
    description.push(
      `${selected.emoji} [mysterious activities](https://nypsi.xyz/docs/economy/items/gems)`,
    );
  }
  if (selected.id === "gold_star") {
    description.push("find a bug and report it (dm nypsi to create a ticket)");
  }
  if (selected.id === "beginner_booster") {
    description.push("given one to begin your nypsi journey");
  }
  if (selected.id === "pandora_box") {
    description.push("[events](https://nypsi.xyz/docs/economy/events?ref=bot-item-pandora)");
  }
  const randomDropPool = lootPools["random_drop"];
  if (Object.keys(randomDropPool.items ?? {}).includes(selected.id)) {
    const weight =
      (getItemWeight(randomDropPool.items[selected.id]) * 100) / getTotalWeight(randomDropPool, []);
    description.push(`💧 loot drop: \`${weight.toFixed(4)}%\``);
  }
  for (const worker of Object.values(workers).filter((w) => w.base.byproducts)) {
    if (Object.keys(worker.base.byproducts).includes(selected.id)) {
      workersDescription.push(`${worker.item_emoji} ${worker.name}`);
    }
  }
  for (const plant of Object.values(plants)) {
    if (plant.item === selected.id) {
      farmDescription.push(`${selected.emoji} ${plant.name}`);
    }
  }
  for (const item of Object.values(items).filter((i) => i.loot_pools)) {
    let totalEntries = 0;
    let itemWeight = 0;
    for (const pool of Object.keys(item.loot_pools)) {
      if (Object.keys(lootPools[pool].items ?? {}).includes(selected.id)) {
        itemWeight +=
          getItemWeight(lootPools[pool].items[selected.id]) / getTotalWeight(lootPools[pool], []);
        totalEntries++;
      }
    }
    if (itemWeight > 0 && totalEntries > 0) {
      const weight = (itemWeight * 100) / totalEntries;
      poolsDescription.set(`${item.emoji} ${item.name}: \`${weight.toFixed(4)}%\``, weight);
    }
  }
  if (workersDescription.length > 0) {
    embed.addField("workers", workersDescription.join("\n"));
  }
  if (farmDescription.length > 0) {
    embed.addField("farm", farmDescription.join("\n"));
  }
  if (poolsDescription.entries().toArray().length > 0) {
    embed.addField(
      "crates and scratches",
      inPlaceSort(poolsDescription.keys().toArray())
        .desc((e) => poolsDescription.get(e))
        .join("\n"),
    );
  }
  if (description.length > 0) {
    embed.setDescription(description.join("\n"));
  } else if ((embed.data?.fields?.length ?? 0) === 0) {
    embed.setDescription("no sources found");
  }
  return { embed: embed };
}

function getCraftingMessage(
  selected: Item,
  member: ItemMessageMember,
  ingredientIn: string[],
): ItemMessageData {
  const embed = new CustomEmbed(member);
  const items = getItems();
  if (selected.craft !== undefined) {
    embed.setDescription(`**${MStoTime(selected.craft.time * 1000)}** craft time`);
    const ingredientsDescription: string[] = [];
    for (const ingredient of selected.craft.ingredients) {
      const split = ingredient.split(":");
      ingredientsDescription.push(
        `\`${split[1]}x\` ${items[split[0]].emoji} ${items[split[0]].name}`,
      );
    }
    embed.addField("recipe", ingredientsDescription.join("\n"));
  }
  const ingredientInItems = ingredientIn.map((i) => items[i]);
  if (ingredientInItems.length > 0) {
    embed.addField(
      "ingredient in",
      ingredientInItems.map((i) => `${i.emoji} ${i.name}`).join("\n"),
    );
  }
  return { embed: embed };
}

function getBoosterMessage(selected: Item, member: ItemMessageMember) {
  return {
    embed: new CustomEmbed(member).setDescription(
      `**boosts** ${selected.boosterEffect.boosts}\n` +
        `**effect** ${selected.boosterEffect.effect}\n` +
        `**time** ${MStoTime(selected.boosterEffect.time * 1000)}\n` +
        `**stacks** ${selected.max ?? 1}` +
        (selected.booster_desc === undefined ? "" : `\n\n*${selected.booster_desc}*`),
    ),
  };
}

function getLootPoolsMessage(selected: Item, member: ItemMessageMember): ItemMessageData {
  const pageLength = 15;
  const description: string[] = [];
  const lootPools = getLootPools();
  const poolOptions: StringSelectMenuOptionBuilder[] = [];
  const subEmbeds: { [subTab: string]: CustomEmbed[] } = {};
  const poolsMap: { [pool: string]: number | string } =
    selected.id === "rain" ? { random_drop: "?" } : selected.loot_pools;
  const pools: string[] = Object.keys(poolsMap);
  for (const poolName in poolsMap) {
    const count = poolsMap[poolName];
    poolOptions.push(
      new StringSelectMenuOptionBuilder().setLabel(poolName).setValue(poolName).setDefault(false),
    );
    description.push(`**${count}** draw${count === 1 ? "" : "s"} from pool \`${poolName}\``);
    const breakdown = poolBreakdown(lootPools[poolName]);
    subEmbeds[poolName] = [];
    for (let i = 0; i < breakdown.length; i += pageLength) {
      subEmbeds[poolName].push(
        new CustomEmbed(member).setDescription(
          `**${count}** draw${count === 1 ? "" : "s"} from pool \`${poolName}\`\n\n` +
            "**entries**\n" +
            breakdown.slice(i, min(i + pageLength, breakdown.length)).join("\n"),
        ),
      );
    }
    if (subEmbeds[poolName].length === 0) {
      subEmbeds[poolName].push(
        new CustomEmbed(member).setDescription(
          `**${count}** draw${count === 1 ? "" : "s"} from pool \`${poolName}\`\n\n` +
            "**entries**\n" +
            "*nothing*",
        ),
      );
    }
  }
  if (selected.role === "scratch-card") {
    for (const embed of subEmbeds[pools[0]]) {
      embed.setDescription(
        `**${selected.clicks}** click${selected.clicks === 1 ? "" : "s"} with pool \`${pools[0]}\``,
      );
    }
    return { embed: subEmbeds[pools[0]] };
  }
  if (pools.length === 1) {
    return { embed: subEmbeds[pools[0]] };
  }
  return {
    embed: new CustomEmbed(member).setDescription(description.join("\n")),
    subEmbeds: subEmbeds,
    subTabs: poolOptions,
  };
}

function getSeedStatsMessage(
  selected: Item,
  member: ItemMessageMember,
  sellMulti: number,
): ItemMessageData {
  const embed = new CustomEmbed(member);
  const items = getItems();
  const plant = getPlantsData()[selected.plantId];
  const product = items[plant.item];
  let sellString = `**sell** $${product.sell.toLocaleString()}`;
  if (["sellable", "prey", "fish"].includes(product.role)) {
    sellString = sellString.concat(
      ` (+**${Math.round(sellMulti * 100)}**% bonus = `,
      `$${Math.floor(product.sell + product.sell * sellMulti).toLocaleString()})`,
    );
  }
  embed.setDescription(
    `**growth time** ${MStoTime(plant.growthTime * 1000)}\n` +
      `**hourly production** ${plant.hourly}\n` +
      `**max product accumulation** ${plant.max}\n`,
  );
  embed.addField("produces", `${product.emoji} ${product.name}\n` + sellString);
  embed.addField(
    "water",
    `**time until unhealthy** ${MStoTime(plant.water.every * 1000)}\n` +
      `**time until dead** ${MStoTime(plant.water.dead * 1000)}`,
  );
  embed.addField(
    "fertilise",
    `**time until unhealthy** ${MStoTime(plant.fertilise.every * 1000)}\n` +
      `**time until dead** ${MStoTime(plant.fertilise.dead * 1000)}`,
  );
  return { embed: embed };
}

function poolBreakdown(pool: LootPool): string[] {
  const description: Map<string, number> = new Map<string, number>();
  const items = getItems();
  const factor = 100 / getTotalWeight(pool, []);
  if (Object.hasOwn(pool, "nothing")) {
    const weight = pool.nothing * factor;
    description.set(`nothing: ${weight}%`, weight);
  }
  for (const key in pool.money) {
    const weight = pool.money[key] * factor;
    description.set(`💰 $${(+key).toLocaleString()}: \`${weight.toFixed(4)}%\``, weight);
  }
  for (const key in pool.xp) {
    const weight = pool.xp[key] * factor;
    description.set(`✨ ${(+key).toLocaleString()} xp: \`${weight.toFixed(4)}%\``, weight);
  }
  for (const key in pool.karma) {
    const weight = pool.karma[key] * factor;
    description.set(`🔮 ${(+key).toLocaleString()} karma: \`${weight.toFixed(4)}%\``, weight);
  }
  for (const key in pool.items ?? {}) {
    const countObj = typeof pool.items[key] === "object" ? pool.items[key].count : {};
    const countString = Object.hasOwn(countObj, "min")
      ? // @ts-expect-error ts doesnt realize min has to be present
        `${countObj.min}-${countObj.max}`
      : `${getItemCount(pool.items[key], key)}`;
    const weight = getItemWeight(pool.items[key]) * factor;
    description.set(
      `\`${countString}x\` ${items[key].emoji} ${items[key].name}: \`${weight.toFixed(4)}%\``,
      weight,
    );
  }
  return inPlaceSort(description.keys().toArray()).by([
    { desc: (e) => description.get(e) },
    { asc: (e) => e },
  ]);
}

// END HELPERS
