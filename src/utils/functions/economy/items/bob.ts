import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import prisma from "../../../../init/database";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { MStoTime } from "../../date";
import sleep from "../../sleep";
import { getCraftingItems } from "../crafting";
import { getInventory, removeInventoryItem } from "../inventory";
import { formatNumber, getItems } from "../utils";
import { pluralize } from "../../string";
import dayjs = require("dayjs");

module.exports = new ItemUse(
  "bob",
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

    const crafting = await prisma.crafting.findMany({
      where: {
        userId: message.author.id,
      },
      select: {
        finished: true,
        id: true,
        itemId: true,
        amount: true,
      },
    });

    if (crafting.length < 1)
      return send({ embeds: [new ErrorEmbed("you are not currently crafting anything")] });

    const inventory = await getInventory(message.member);

    let amount = 1;

    if (args[1] && args[1].toLowerCase() === "all") args[1] = inventory.count("bob").toString();

    if (args[1]) {
      amount = formatNumber(args[1]);
    }

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.count("bob") < amount)
      return send({ embeds: [new ErrorEmbed("you dont have this many bobs")] });

    const breakdown: string[] = [];

    let maxUsedAmount = 0;

    for (const item of crafting) {
      const remainingMs = item.finished.getTime() - Date.now();
      const remainingHours = remainingMs / (1000 * 60 * 60);

      const usableAmount = Math.min(amount, Math.ceil(remainingHours));
      if (usableAmount <= 0) continue;

      const newDate = dayjs(item.finished).subtract(usableAmount, "hour").toDate();

      let oldDateText = MStoTime(item.finished.getTime() - Date.now());
      if (Date.now() > item.finished.getTime()) {
        oldDateText = "done";
      }

      let newDateText = MStoTime(newDate.getTime() - Date.now());
      if (Date.now() > newDate.getTime()) {
        newDateText = "done";
      }

      breakdown.push(
        `\`${item.amount.toLocaleString()}x\` ${getItems()[item.itemId].emoji} ${
          getItems()[item.itemId].name
        }: \`${oldDateText}\` → \`${newDateText}\``,
      );

      if (usableAmount > maxUsedAmount) {
        maxUsedAmount = usableAmount;
      }

      await prisma.crafting.update({
        where: {
          id: item.id,
        },
        data: {
          finished: newDate,
        },
      });
    }

    if (maxUsedAmount == 0)
      return send({ embeds: [new ErrorEmbed("you are not currently crafting anything")] });

    await removeInventoryItem(message.member, "bob", maxUsedAmount);

    getCraftingItems(message.member);

    const msg = await send({
      embeds: [
        new CustomEmbed(message.member, "<:nypsi_bob:1078776552067694672> sending bob to work..."),
      ],
    });

    await sleep(2000);

    return msg.edit({
      embeds: [
        new CustomEmbed(
          message.member,
          `<:nypsi_bob:1078776552067694672> bob has removed ${maxUsedAmount} ${pluralize("hour", maxUsedAmount)} of crafting time from ${crafting.length} ${pluralize("item", crafting.length)}\n\n${breakdown.join("\n")}`,
        ),
      ],
    });
  },
);
