import dayjs = require("dayjs");
import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { getBalance, removeBalance } from "../utils/functions/economy/balance";
import { addStat } from "../utils/functions/economy/stats";
import {
  addTicket,
  createUser,
  getTickets,
  lotteryTicketPrice,
  userExists,
} from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("lottery", "enter the daily lottery draw", "money").setAliases(["lotto"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((buy) =>
    buy
      .setName("buy")
      .setDescription("buy lottery tickets")
      .addStringOption((option) =>
        option.setName("amount").setDescription("amount of lottery tickets to buy"),
      ),
  )
  .addSubcommand((tickets) =>
    tickets.setName("tickets").setDescription("view your current tickets"),
  );

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const tickets = await getTickets(message.member);

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
    const embed = new CustomEmbed(message.member);

    const winChance = ((tickets.length / (await prisma.lotteryTicket.count())) * 100).toPrecision(
      3,
    );

    embed.setHeader("lottery", message.author.avatarURL());
    embed.setDescription(
      `nypsi lottery is a daily draw which happens in the [official nypsi server](https://discord.gg/hJTDNST)\nnext draw <t:${dayjs()
        .add(1, "day")
        .startOf("day")
        .unix()}:R>\n\n` +
        `you can buy lottery tickets for $**${lotteryTicketPrice.toLocaleString()}** with ${(await getPrefix(message.guild))[0]}**lotto buy**\nyou have **${tickets.length.toLocaleString()}**/${Constants.LOTTERY_TICKETS_MAX.toLocaleString()} tickets (${winChance}% chance of winning)`,
    );

    return send({ embeds: [embed] });
  };

  if (args.length == 0) {
    return help();
  } else if (args[0].toLowerCase() == "buy" || args[0].toLowerCase() == "b") {
    if (await onCooldown(cmd.name, message.member)) {
      const res = await getResponse(cmd.name, message.member);

      if (res.respond) send({ embeds: [res.embed] });
      return;
    }

    let amount: number;

    if (!args[1]) {
      amount = 1;
    } else if (parseInt(args[1])) {
      amount = parseInt(args[1]);
    } else if (args[1].toLowerCase() == "all" || args[1].toLowerCase() == "max") {
      amount = Constants.LOTTERY_TICKETS_MAX;
    } else {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount < 1) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (tickets.length + amount > Constants.LOTTERY_TICKETS_MAX) {
      amount = Constants.LOTTERY_TICKETS_MAX - tickets.length;
    }

    if (tickets.length >= Constants.LOTTERY_TICKETS_MAX) {
      return send({
        embeds: [
          new ErrorEmbed(`you can only have ${Constants.LOTTERY_TICKETS_MAX} tickets at a time`),
        ],
      });
    }

    if ((await getBalance(message.member)) < lotteryTicketPrice * amount) {
      return send({
        embeds: [new ErrorEmbed("you cannot afford this")],
      });
    }

    await addCooldown(cmd.name, message.member, 10);

    await removeBalance(message.member, lotteryTicketPrice * amount);
    addStat(message.author.id, "spent-lottery", lotteryTicketPrice * amount);

    await addTicket(message.member, amount);

    const embed = new CustomEmbed(
      message.member,
      `you have bought **${amount}** lottery ticket${amount > 1 ? "s" : ""} for $**${(
        lotteryTicketPrice * amount
      ).toLocaleString()}**`,
    );

    return send({ embeds: [embed] });
  } else {
    return help();
  }
}

cmd.setRun(run);

module.exports = cmd;
