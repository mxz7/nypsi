import {
  BaseMessageOptions,
  CommandInteraction,
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
import { getInventory, setInventoryItem } from "../inventory";
import { formatNumber, getItems } from "../utils";
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

    if (args[1] && args[1].toLowerCase() === "all")
      args[1] = inventory.find((i) => i.item === "bob").amount.toString();

    if (args[1]) {
      amount = formatNumber(args[1]);
    }

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.find((i) => i.item === "bob").amount < amount)
      return send({ embeds: [new ErrorEmbed("you dont have this many bobs")] });

    await setInventoryItem(
      message.member,
      "bob",
      inventory.find((i) => i.item === "bob").amount - amount,
    );

    const breakdown: string[] = [];

    for (const item of crafting) {
      const newDate = dayjs(item.finished).subtract(amount, "hour").toDate();

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

      await prisma.crafting.update({
        where: {
          id: item.id,
        },
        data: {
          finished: newDate,
        },
      });
    }

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
          `<:nypsi_bob:1078776552067694672> bob has removed ${amount} hour${
            amount > 1 ? "s" : ""
          } of crafting time from ${crafting.length} item${
            crafting.length != 1 ? "s" : ""
          }\n\n${breakdown.join("\n")}`,
        ),
      ],
    });
  },
);
