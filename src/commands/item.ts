import {
  ActionRowBuilder,
  APIInteractionGuildMember,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { MStoTime } from "../utils/functions/date";
import { getSellMulti } from "../utils/functions/economy/balance";
import {
  calcItemValue,
  getInventory,
  getTotalAmountOfItem,
  Inventory,
  selectItem,
} from "../utils/functions/economy/inventory";
import { countItemOnMarket } from "../utils/functions/economy/market";
import { createUser, getBaseWorkers, getItems, getLootPools, getPlantsData, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getEmojiImage } from "../utils/functions/image";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { getItemCount, getItemWeight, getTotalWeight } from "../utils/functions/economy/loot_pools";
import { LootPool } from "../types/LootPool";
import { inPlaceSort } from "fast-sort";
import { min } from "mathjs";
import { Item } from "../types/Economy";

const rarities = [
  "common",
  "uncommon",
  "rare",
  "very rare",
  "exotic",
  "impossible",
  "more impossible",
  "even more impossible" // 7
];
const lootPools = getLootPools();
const items = getItems();
const workers = getBaseWorkers();
const plants = getPlantsData();

type ItemMessageMember = GuildMember | (GuildMember & APIInteractionGuildMember);
type ItemMessageData = {
  embed: CustomEmbed,
  subEmbeds?: { [subTab: string]: CustomEmbed | CustomEmbed[] },
  subTabs?: StringSelectMenuOptionBuilder[],
  widgets?: ActionRowBuilder<MessageActionRowComponentBuilder>
};

const cmd = new Command("item", "view information about an item", "money").setAliases(["i"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option
    .setName("item-global")
    .setDescription("item you want to view info for")
    .setAutocomplete(true)
    .setRequired(true),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (args.length == 0) {
    return send({ embeds: [new ErrorEmbed("/item <item>")] });
  }

  const selected = selectItem(args.join(" ").toLowerCase());

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args.join(" ")}\``)] });
  }

  await addCooldown(cmd.name, message.member, 4);

  const prefix = (await getPrefix(message.guild))[0];

  const tabs: {[tab: string]: ItemMessageData} = {};
  const metaTabs: StringSelectMenuOptionBuilder[] = [];

  const [total, inMarket, value, sellMulti] = await Promise.all([
    getTotalAmountOfItem(selected.id),
    countItemOnMarket(selected.id, "sell"),
    calcItemValue(selected.id),
    getSellMulti(message.author, message.client as NypsiClient),
  ]);

// =====vvvvv===== MESSAGE DATA =====vvvvv=====

  // general
  tabs["general"] = getGeneralMessage(selected, message.member, prefix);
  metaTabs.push(new StringSelectMenuOptionBuilder()
    .setLabel("general")
    .setValue("general")
    .setDefault(true)
  );

  // economy
  tabs["economy"] = getEconomyMessage(selected, message.member, total, inMarket, value, sellMulti.multi);
  metaTabs.push(new StringSelectMenuOptionBuilder()
    .setLabel("economy")
    .setValue("economy")
    .setDefault(false)
  );

  // sources
  tabs["sources"] = getSourcesMessage(selected, message.member);
  metaTabs.push(new StringSelectMenuOptionBuilder()
    .setLabel("sources")
    .setValue("sources")
    .setDefault(false)
  );

  // loot pools
  if(selected.loot_pools) {
    tabs["loot_pools"] = getLootPoolsMessage(selected, message.member);
    metaTabs.push(new StringSelectMenuOptionBuilder()
      .setLabel("loot_pools")
     .setValue("loot_pools")
     .setDefault(false)
    );
  }

  // seed stats
  if(selected.role === "seed") {
    tabs["seed_stats"] = getSeedStatsMessage(selected, message.member, sellMulti.multi);
    metaTabs.push(new StringSelectMenuOptionBuilder()
      .setLabel("seed stats")
     .setValue("seed_stats")
     .setDefault(false)
    );
  }

// =====^^^^^===== MESSAGE DATA =====^^^^^=====

  // format the message
  const inventory: Inventory = await getInventory(message.member);
  const inventoryHas: boolean = inventory.has(selected.id);
  const title = `${selected.emoji} ${selected.name}`;
  const thumbnail = getEmojiImage(selected.emoji);
  for(const tab in tabs) {
    tabs[tab].embed
      .setTitle(title)
      .setThumbnail(thumbnail)
      .disableFooter();
    if(inventoryHas) {
      tabs[tab].embed.setFooter({
          text: `you have ${inventory.count(selected.id).toLocaleString()} ${pluralize(
            selected,
            inventory.count(selected.id),
          )}`,
        });
    }
    for(const subTab in tabs[tab].subEmbeds ?? {}) {
      let subs = tabs[tab].subEmbeds[subTab];
      subs = subs instanceof Array ? subs : [subs];
      for(const sub of subs) {
        sub
          .setTitle(title)
          .setThumbnail(thumbnail)
          .disableFooter();
        if(inventoryHas) {
          sub.setFooter({
            text: `you have ${inventory.count(selected.id).toLocaleString()} ${pluralize(
              selected,
              inventory.count(selected.id),
            )}`,
          });
        }
      }
    }
  }

  // logic
  const showItemMeta = async (msg?: Message, res?: StringSelectMenuInteraction): Promise<{ buttonRow: any; embed: any; }> => {
    const showItemPage = async (tabName: string, subTab?: string, page?: number) => {
      for (const tab of metaTabs) {
        tab.setDefault(tab.data.value === tabName);
      }
      if(tabs[tabName].subTabs !== undefined) {
        for (const tab of tabs[tabName].subTabs) {
          tab.setDefault(tab.data.value === subTab);
        }
      }

      const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("tabs")
            .setOptions(metaTabs)
        )
      );
      if(tabs[tabName].subTabs !== undefined) {
        rows.push(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("subtabs")
              .setOptions(tabs[tabName].subTabs)
          )
        );
      }

      let target = subTab === undefined ? tabs[tabName].embed : tabs[tabName].subEmbeds[subTab];
      if(target instanceof Array) {
        rows.push(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary)
              .setDisabled(page === undefined || page === 0),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
              .setDisabled(page === target.length - 1)
          )
        );
        target = target[page ?? 0];
      }
      if(tabs[tabName].widgets !== undefined) {
        rows.push(tabs[tabName].widgets)
      }
      return { embed: target, widgetRows: rows };
    }
    
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
      if(res.isButton() && ["⬅", "➡"].includes(res.customId)) {
        targetPage = (page ?? 0) + +(res.customId === "➡") - +(res.customId === "⬅");
      }
      if(res.isStringSelectMenu() && res.customId === "subtabs") {
        targetSub = res.values[0];
        targetPage = undefined;
      }
      if(res.isStringSelectMenu() && res.customId === "tabs") {
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

    const { embed, widgetRows } = await showItemPage("general");
    const messageUpdateParams = { embeds: [embed], components: widgetRows };

    if (res) {
      await res
        .update(messageUpdateParams)
        .catch(() => msg.edit(messageUpdateParams));
    } else if (msg) {
      msg = await msg.edit(messageUpdateParams);
    } else {
      msg = await send(messageUpdateParams);
    }

    return pageManager("general");
  };

  showItemMeta();
  return;
}

// HELPERS

function getGeneralMessage(
  selected: Item,
  member: ItemMessageMember,
  prefix: string
): ItemMessageData {
  const embed = new CustomEmbed(member);
  let description: string[] = [
    `**id** [\`${selected.id}\`](https://nypsi.xyz/item/${selected.id}?ref=bot-item)`,
    `**description**`,
    `> ${selected.longDesc}` + (selected.booster_desc === undefined ? "" : `\n> ${selected.booster_desc}`)
  ];
  if (selected.aliases) {
    description.push(`**aliases** \`${selected.aliases.join("`, `")}\``);
  }
  if (selected.buy) {
    description.push(`**buy** $${selected.buy.toLocaleString()}`);
  }
  if (selected.sell) {
    description.push(`**sell** $${selected.sell.toLocaleString()}`);
  }
  if (typeof selected.rarity === "number" && selected.rarity >= 0 && selected.rarity < rarities.length) {
    description.push(`**rarity** ${rarities[selected.rarity]} (${selected.rarity})`);
  }
  if (selected.role) {
    description.push(`**role** ${selected.role}`);
    if (selected.role === "booster") {
      embed.addField(
        "booster info",
        `**boosts** ${selected.boosterEffect.boosts}\n` +
        `**effect** ${selected.boosterEffect.effect}\n` +
        `**time** ${MStoTime(selected.boosterEffect.time * 1000)}\n` +
        `**stacks** ${selected.max ?? 1}\n` +
        `you can activate your booster with ${prefix}**activate <booster>**`
      );
    } else if (selected.role == "car") {
      embed.addField(
        "car info",
        `**speed** ${selected.speed}\n` +
        `cars are used for street races (${prefix}**streetrace**)`,
      );
    } else if (
      selected.role === "collectable" ||
      selected.role === "flower" ||
      selected.role === "cat"
    ) {
      embed.addField(
        "collectable info",
        "collectables don't do anything, theyre just *collectables*. if you dont want them, you can get rid of them by selling them",
      );
    } else if (
      selected.role == "sellable" ||
      selected.role == "prey" ||
      selected.role == "fish"
    ) {
      embed.addField(
        "sellable",
        `this item is just meant to be sold. you can use the ${prefix}**sell all** command to do so quickly`,
      );
    }
  }
  return { embed: embed.setDescription(description.join("\n")) };
}

function getEconomyMessage(
  selected: Item,
  member: ItemMessageMember,
  total: number,
  inMarket: bigint | 0,
  value: number,
  sellMulti: number
): ItemMessageData {
  const embed = new CustomEmbed(member);
  const description: string[] = [
    `[\`${selected.id}\`](https://nypsi.xyz/item/${selected.id}?ref=bot-item)`
  ];
  if(selected.unique) {
    description.push("*unique*");
  }
  if (!selected.in_crates) {
    description.push("*cannot be found in crates*");
  }
  if (selected.buy) {
   description.push(`**buy** $${selected.buy.toLocaleString()}`);
  }
  if (selected.sell) {
    description.push(`**sell** $${selected.sell.toLocaleString()}`);
    if (
      selected.role == "sellable" ||
      selected.role == "prey" ||
      selected.role == "fish"
    ) {
      description[description.length - 1] = description[description.length - 1].concat(
        ` (+**${sellMulti * 100}**% bonus = `,
        `$${Math.floor(selected.sell + selected.sell * sellMulti).toLocaleString()})`
      );
    }
  }
  if (selected.account_locked) {
    description.push("\n**account locked**");
  } else {
    description.push(
      `**worth** ${value ? `$${Math.floor(value).toLocaleString()}` : "[unvalued](https://nypsi.xyz/docs/economy/items/worth?ref=bot-item#unvalued)"}`,
    );
    if (total && selected.id !== "lottery_ticket") {
      description.push(`**in world** ${total.toLocaleString()}`);
    }
    if (inMarket) {
      description.push(`**in market** ${inMarket.toLocaleString()}`);
    }
    if (selected.role) {
      embed.addField(
        "role",
        `\`${selected.role}\``,
        true,
      );
    }
    if (typeof selected.rarity === "number" && selected.rarity >= 0 && selected.rarity < rarities.length) {
      embed.addField(
        "rarity",
        `${rarities[selected.rarity]}`
      );
    }
  }
  return {
    embed: embed.setDescription(description.join("\n")),
    widgets: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("leaderboard")
        .setEmoji("🏆")
        .setURL(`https://nypsi.xyz/leaderboard/${selected.id}?ref=bot-item`)
    )
  };
}

function getSourcesMessage(
  selected: Item,
  member: ItemMessageMember
): ItemMessageData {
  const embed = new CustomEmbed(member);
  const description: string[] = [];
  let workersDescription: string[] = [];
  let farmDescription: string[] = [];
  let poolsDescription: string[] = [];
  if(selected.buy) {
    description.push("💰 shop")
  }
  if(selected.craft) {
    description.push("<:Craft:615426524862087191> crafting")
  }
  for(const worker of Object.values(workers).filter((w) => w.base.byproducts)) {
    if(Object.keys(worker.base.byproducts).includes(selected.id)) {
      workersDescription.push(`${worker.item_emoji} ${worker.name}`)
    }
  }
  for(const plant of Object.values(plants)) {
    if(plant.item === selected.id) {
      farmDescription.push(`${selected.emoji} ${plant.name}`)
    }
  }
  for(const item of Object.values(items).filter((i) => i.loot_pools)) {
    for(const pool of Object.keys(item.loot_pools)) {
      if(Object.keys(lootPools[pool].items ?? {}).includes(selected.id)) {
        poolsDescription.push(`${item.emoji} ${item.name}`);
        break;
      }
    }
  }
  if(workersDescription.length > 0) {
    embed.addField(
      "workers",
      workersDescription.join("\n")
    );
  }
  if(farmDescription.length > 0) {
    embed.addField(
      "farm",
      farmDescription.join("\n")
    );
  }
  if(poolsDescription.length > 0) {
    embed.addField(
      "crates and scratches",
      poolsDescription.join("\n")
    );
  }
  if(description.length > 0) {
    embed.setDescription(description.join("\n"))
  }
  return { embed: embed };
}

function getLootPoolsMessage(
  selected: Item,
  member: ItemMessageMember
): ItemMessageData {
  const description: string[] = [];
  const pools: string[] = [];
  const poolOptions: StringSelectMenuOptionBuilder[] = [];
  const subEmbeds: { [subTab: string]: CustomEmbed[] } = {};
  for(const poolName in selected.loot_pools) {
    const count = selected.loot_pools[poolName];
    pools.push(poolName);
    poolOptions.push(new StringSelectMenuOptionBuilder()
      .setLabel(poolName)
      .setValue(poolName)
      .setDefault(false)
    );
    description.push(`**${count}** draw${count === 1 ? "" : "s"} from pool \`${poolName}\``);
    const breakdown = poolBreakdown(lootPools[poolName]);
    subEmbeds[poolName] = [];
    for(let i = 0; i < breakdown.length; i += 20) {
      subEmbeds[poolName].push(
        new CustomEmbed(member)
          .setDescription(
            `**${count}** draw${count === 1 ? "" : "s"} from pool \`${poolName}\`\n\n` +
            breakdown.slice(i, min(i + 20, breakdown.length)).join("\n")
          )
      );
    }
    if(subEmbeds[poolName].length === 0) {
      subEmbeds[poolName].push(
        new CustomEmbed(member)
          .setDescription(`**${count}** draw${count === 1 ? "" : "s"} from pool \`${poolName}\`\n\nNothing`)
      );
    }
  }
  return {
    embed: new CustomEmbed(member).setDescription(description.join("\n")),
    subEmbeds: subEmbeds,
    subTabs: poolOptions
  };
}

function getSeedStatsMessage(
  selected: Item,
  member: ItemMessageMember,
  sellMulti: number
): ItemMessageData {
  const embed = new CustomEmbed(member);
  const plant = plants[selected.plantId];
  const product = items[plant.item];
  let sellString = `**sell** $${product.sell.toLocaleString()}`;
  if (
    product.role == "sellable" ||
    product.role == "prey" ||
    product.role == "fish"
  ) {
    sellString = sellString.concat(
      ` (+**${sellMulti * 100}**% bonus = `,
      `$${Math.floor(product.sell + product.sell * sellMulti).toLocaleString()})`
    );
  }
  embed.setDescription(
    `**growth time** ${MStoTime(plant.growthTime * 1000)}\n` +
    `**hourly production** ${plant.hourly}\n` +
    `**max product accumulation** ${plant.max}\n`
  );
  embed.addField(
    "produces",
    `${product.emoji} ${product.name}\n` +
    sellString
  );
  embed.addField(
    "water",
    `**time until unhealthy** ${MStoTime(plant.water.every * 1000)}\n` +
    `**time until dead** ${MStoTime(plant.water.dead * 1000)}`
  );
  embed.addField(
    "fertilise",
    `**time until unhealthy** ${MStoTime(plant.fertilise.every * 1000)}\n` +
    `**time until dead** ${MStoTime(plant.fertilise.dead * 1000)}`
  );
  return { embed: embed };
}

function poolBreakdown(pool: LootPool): string[] {
  const description: Map<string, number> = new Map<string, number>();
  const factor = 100 / getTotalWeight(pool, []);
  if(Object.hasOwn(pool, "nothing")) {
    const weight = pool.nothing * factor;
    description.set(`nothing: ${weight}%`, weight);
  }
  for(const key in pool.money) {
    const weight = pool.money[key] * factor;
    description.set(`💰 $${(+key).toLocaleString()}: \`${weight.toFixed(4)}%\``, weight)
  }
  for(const key in pool.xp) {
    const weight = pool.xp[key] * factor;
    description.set(`✨ ${(+key).toLocaleString()} xp: \`${weight.toFixed(4)}%\``, weight)
  }
  for(const key in pool.karma) {
    const weight = pool.karma[key] * factor;
    description.set(`🔮 ${(+key).toLocaleString()} karma: \`${weight.toFixed(4)}%\``, weight)
  }
  for(const key in pool.items ?? {}) {
    const countObj = typeof pool.items[key] === "object" ? pool.items[key].count : {};
    // @ts-expect-error
    const countString = Object.hasOwn(countObj, "min") ? `${countObj.min}-${countObj.max}` : `${getItemCount(pool.items[key], key)}`;
    const weight = getItemWeight(pool.items[key]) * factor;
    description.set(`\`${countString}x\` ${items[key].emoji} ${items[key].name}: \`${weight.toFixed(4)}%\``, weight);
  }
  return inPlaceSort(description.keys().toArray()).desc((e) => description.get(e));
}

// END HELPERS

cmd.setRun(run);

module.exports = cmd;
