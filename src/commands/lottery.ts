import dayjs = require("dayjs");
import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
import {
  getApproximatPrizePool,
  getDailyLottoTickets,
  setDailyLotteryTickets,
} from "../utils/functions/economy/lottery";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";

const cmd = new Command("lottery", "enter the daily lottery draw", "money").setAliases(["lotto"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((autobuy) =>
    autobuy
      .setName("autobuy")
      .setDescription("auto buy lottery tickets")
      .addStringOption((option) =>
        option
          .setName("amount")
          .setDescription("amount of lottery tickets to auto buy daily")
          .setRequired(true),
      ),
  )
  .addSubcommand((tickets) =>
    tickets.setName("tickets").setDescription("view your current tickets"),
  );

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

  const help = async () => {
    const tickets = await getInventory(message.member).then(
      (inventory) => inventory.find((item) => item.item === "lottery_ticket")?.amount || 0,
    );
    const embed = new CustomEmbed(message.member);

    const pool = await getApproximatPrizePool();
    const autoBuy = await getDailyLottoTickets(message.author.id);

    embed.setHeader("lottery", message.author.avatarURL());
    embed.setDescription(
      `nypsi lottery is a daily draw which happens in the [official nypsi server](https://discord.gg/hJTDNST)\nnext draw <t:${dayjs()
        .add(1, "day")
        .startOf("day")
        .unix()}:R>\n\n` +
        `current prize pool is $${pool.min.toLocaleString()} - $${pool.max.toLocaleString()}\n\n` +
        `you can buy lottery tickets with ${(await getPrefix(message.guild))[0]}**buy lotto**\nyou have **${tickets.toLocaleString()}** tickets${typeof autoBuy === "number" ? `, auto buying ${autoBuy} tickets daily` : ""}`,
    );

    return send({ embeds: [embed] });
  };

  if (args.length == 0) {
    return help();
  } else if (args[0].toLowerCase() == "buy" || args[0].toLowerCase() == "b") {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `this has moved to ${(await getPrefix(message.guild))[0]}**buy lotto**`,
        ),
      ],
    });
  } else if (args[0].toLowerCase() == "tickets") {
    return help();
  } else if (args[0].toLowerCase() === "autobuy") {
    if (args.length === 1) {
      return send({ embeds: [new ErrorEmbed("$lotto autobuy <amount>")] });
    }

    const amount = parseInt(args[1]);

    if (isNaN(amount) || amount <= 0) {
      return send({ embeds: [new ErrorEmbed("invalid number")] });
    }

    if (amount > 100000) {
      return send({ embeds: [new ErrorEmbed("invalid number")] });
    }

    await setDailyLotteryTickets(message.author.id, amount);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you will now auto buy **${amount}** lottery tickets daily ($${(amount * getItems()["lottery_ticket"].buy).toLocaleString()})`,
        ),
      ],
    });
  } else {
    return help();
  }
}

cmd.setRun(run);

module.exports = cmd;
