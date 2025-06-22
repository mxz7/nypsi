import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
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
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getEmojiImage } from "../utils/functions/image";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

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

  const prefix = await getPrefix(message.guild);

  const metaTabs: StringSelectMenuOptionBuilder[] = []
  let metaEmbeds: {[tab: string]: CustomEmbed} = {};
  let tabButtons: {[tab: string]: ActionRowBuilder<MessageActionRowComponentBuilder>} = {};

// =====vvvvv===== MESSAGE DATA =====vvvvv=====

  // general
  let embed = new CustomEmbed(message.member);
  metaTabs.push(new StringSelectMenuOptionBuilder()
    .setLabel("general")
    .setValue("general")
    .setDefault(true)
  );
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
  metaEmbeds["general"] = embed
    .setDescription(description.join("\n"));

  // economy
  embed = new CustomEmbed(message.member);
  tabButtons["economy"] = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("leaderboard")
      .setEmoji("🏆")
      .setURL(`https://nypsi.xyz/leaderboard/${selected.id}?ref=bot-item`)
  );
  metaTabs.push(new StringSelectMenuOptionBuilder()
    .setLabel("economy")
    .setValue("economy")
    .setDefault(false)
  );
  const [total, inMarket, value, sellMulti] = await Promise.all([
    getTotalAmountOfItem(selected.id),
    countItemOnMarket(selected.id, "sell"),
    calcItemValue(selected.id),
    getSellMulti(message.author, message.client as NypsiClient),
  ]);
  description = [
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
    if (
      selected.role == "sellable" ||
      selected.role == "prey" ||
      selected.role == "fish"
    ) {
      description.push(
        `**sell** $${selected.sell.toLocaleString()} ` +
        `(+**${sellMulti.multi * 100}**% bonus = ` +
        `$${Math.floor(selected.sell + selected.sell * sellMulti.multi).toLocaleString()})`
      );
    } else {
      description.push(`**sell** $${selected.sell.toLocaleString()}`);
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
  metaEmbeds["economy"] = embed
    .setDescription(description.join("\n"));

// =====^^^^^===== MESSAGE DATA =====^^^^^=====

  // format the message
  const inventory: Inventory = await getInventory(message.member);
  const inventoryHas: boolean = inventory.has(selected.id);
  const title = `${selected.emoji} ${selected.name}`;
  const thumbnail = getEmojiImage(selected.emoji);
  for(const embedName in metaEmbeds) {
    metaEmbeds[embedName]
      .setTitle(title)
      .setThumbnail(thumbnail)
      .disableFooter();
    if (inventoryHas) {
      metaEmbeds[embedName].setFooter({
        text: `you have ${inventory.count(selected.id).toLocaleString()} ${pluralize(
          selected,
          inventory.count(selected.id),
        )}`,
      });
    }
  }

  // logic
  const showItemMeta = async (msg?: Message, res?: StringSelectMenuInteraction): Promise<{ buttonRow: any; embed: any; }> => {
    const showItemPage = async (tabName: string = "general") => {
      for (const tab of metaTabs) {
        tab.setDefault(tab.data.value === tabName);
      }

      const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("tabs")
            .setOptions(metaTabs)
        )
      );
      if(tabButtons[tabName] !== undefined) {
        rows.push(tabButtons[tabName])
      }

      return { embed: metaEmbeds[tabName], widgetRows: rows };
    }
    
    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
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

      if (res.isStringSelectMenu()) {
        const { embed, widgetRows } = await showItemPage(res.values[0]);
        await res
          .update({ embeds: [embed], components: widgetRows })
          .catch(() => res.message.edit({ embeds: [embed], components: widgetRows }));
        return pageManager();
      }
    };

    const { embed, widgetRows } = await showItemPage();
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

    return pageManager();
  };

  return showItemMeta();
}

cmd.setRun(run);

module.exports = cmd;
