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
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { ItemUse } from "../../../../models/ItemUse";
import { getInventory, removeInventoryItem, selectItem } from "../inventory";
import { doDaily, getLastDaily } from "../utils";
import { ErrorEmbed } from "../../../../models/EmbedBuilders";
import { getTier, isPremium } from "../../premium/premium";
import dayjs = require("dayjs");

module.exports = new ItemUse(
  "streak_token",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
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

    const inventory = await getInventory(message.member);

    const selected = selectItem("streak_token");

    let amount = 1;

    if (args[1]?.toLowerCase() === "all") {
      amount = inventory.count(selected.id);
    } else if (parseInt(args[1])) {
      amount = parseInt(args[1]);
    }

    let max = 3;

    if (await isPremium(message.member)) {
      max = 5 + (await getTier(message.member)) * 5;
    }

    if (amount > max) amount = max;

    if (amount > inventory.count(selected.id))
      return send({ embeds: [new ErrorEmbed(`you don't have ${amount} ${selected.name}`)] });

    await removeInventoryItem(message.member, "streak_token", amount);

    const embed = await doDaily(message.member, false, amount);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setCustomId("run-daily")
        .setLabel("you haven't done /daily!"),
    );

    const lastDaily = await getLastDaily(message.member);

    if (dayjs(lastDaily.getTime()).isBefore(dayjs(), "day")) {
      return send({ embeds: [embed], components: [row] });
    }

    return send({ embeds: [embed] });
  },
);
