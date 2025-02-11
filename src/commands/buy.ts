import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getBalance, removeBalance } from "../utils/functions/economy/balance";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import dayjs = require("dayjs");

const cmd = new Command("buy", "buy items from the shop", "money");

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option
      .setName("item-buy")
      .setRequired(true)
      .setAutocomplete(true)
      .setDescription("item you want to buy"),
  )
  .addStringOption((option) => option.setName("amount").setDescription("amount you want to buy"));

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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  if (args.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `buy items from ${(await getPrefix(message.guild))[0]}shop by using the item id or item name without spaces`,
        ),
      ],
    });
  }

  const items = getItems();

  const searchTag = args[0].toLowerCase();

  let selectedName: string;

  for (const itemName of Array.from(Object.keys(items))) {
    const aliases = items[itemName].aliases ? items[itemName].aliases : [];
    if (searchTag == itemName) {
      selectedName = itemName;
      break;
    } else if (searchTag == itemName.split("_").join("")) {
      selectedName = itemName;
      break;
    } else if (aliases.indexOf(searchTag) != -1) {
      selectedName = itemName;
      break;
    }
  }

  const selected = items[selectedName];

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
  }

  if (!selected.buy) {
    return send({ embeds: [new ErrorEmbed("you cannot buy this item")] });
  }

  if (selected.id === "lottery_ticket") {
    const limit = dayjs().set("hour", 23).set("minute", 59).set("second", 0).set("millisecond", 0);

    if (dayjs().isAfter(limit) || (await redis.exists("nypsi:lottery"))) {
      return send({ embeds: [new ErrorEmbed("you cannot currently buy a lottery ticket")] });
    }
  }

  let balance = await getBalance(message.member);
  let amount = 1;

  if (args.length != 1) {
    amount =
      args[1].toLowerCase() === "all" ? Math.floor(balance / selected.buy) : parseInt(args[1]);
  }

  if (!amount) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (amount < 1) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (balance < selected.buy * amount) {
    return send({ embeds: [new ErrorEmbed("you cannot afford this")] });
  }

  let msg: Message;
  let interaction: ButtonInteraction | void;

  if (selected.buy * amount > 5_000_000) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
      new ButtonBuilder().setCustomId("confirm").setLabel("confirm").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cancel").setLabel("cancel").setStyle(ButtonStyle.Danger),
    );

    msg = await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `are you sure you want to buy **${amount.toLocaleString()}** ${selected.emoji} ${selected.name} for $**${(selected.buy * amount).toLocaleString()}**?`,
        ),
      ],
      components: [row],
    });

    interaction = await msg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        componentType: ComponentType.Button,
        time: 15000,
      })
      .catch(() => {
        row.components.forEach((i) => i.setDisabled(true));
        msg.edit({ components: [row] });
      });

    if (!interaction) return;

    setTimeout(() => {
      if (!interaction) return;
      interaction.deferUpdate().catch(() => {});
    }, 1500);

    if (interaction.customId === "cancel") {
      row.components.forEach((i) => i.setDisabled(true));

      return interaction
        .update({
          components: [row],
        })
        .catch(() => msg.edit({ components: [row] }));
    }

    balance = await getBalance(message.member);

    if (balance < selected.buy * amount) {
      return interaction
        .reply({ embeds: [new CustomEmbed(message.member, "trying to pull a fast one are you?")] })
        .catch(() =>
          msg.edit({
            embeds: [new CustomEmbed(message.member, "trying to pull a fast one are you?")],
          }),
        );
    }
  }

  await addCooldown(cmd.name, message.member, 5);

  await removeBalance(message.member, selected.buy * amount);
  addStat(message.author.id, "spent-shop", selected.buy * amount);
  await addInventoryItem(message.member, selected.id, amount);

  const embed = new CustomEmbed(
    message.member,
    `you have bought **${amount.toLocaleString()}** ${selected.emoji} ${selected.name} for $${(
      selected.buy * amount
    ).toLocaleString()}`,
  );

  if (!msg) {
    return send({ embeds: [embed] });
  } else if (msg && interaction) {
    return interaction
      .update({ embeds: [embed], components: [] })
      .catch(() => msg.edit({ embeds: [embed], components: [] }));
  }
}

cmd.setRun(run);

module.exports = cmd;
