import dayjs = require("dayjs");
import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { getInventory } from "../utils/functions/economy/inventory";
import {
  getApproximatePrizePool,
  getDailyLottoTickets,
  setDailyLotteryTickets,
} from "../utils/functions/economy/lottery";
import {
  createUser,
  formatNumberPretty,
  getItems,
  userExists,
} from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";

const cmd = new Command("lottery", "enter the daily lottery draw", "money").setAliases(["lotto"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((autobuy) =>
    autobuy
      .setName("autobuy")
      .setDescription("auto buy lottery tickets at a discount")
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
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const help = async () => {
    const tickets = (await getInventory(message.member)).count("lottery_ticket");
    const embed = new CustomEmbed(message.member);

    const pool = await getApproximatePrizePool();
    const autoBuy = await getDailyLottoTickets(message.member);

    embed.setHeader("lottery", message.author.avatarURL());
    embed.setDescription(
      `nypsi lottery is a daily draw which happens in the [official nypsi server](${Constants.NYPSI_SERVER_INVITE_LINK})\nnext draw <t:${dayjs()
        .add(1, "day")
        .startOf("day")
        .unix()}:R>\n\n` +
        `current prize pool is $**${formatNumberPretty(pool.min)}** - $**${formatNumberPretty(pool.max)}**\n\n` +
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

    if (isNaN(amount) || amount < 0) {
      return send({ embeds: [new ErrorEmbed("invalid number")] });
    }

    if (amount > 100000) {
      return send({ embeds: [new ErrorEmbed("invalid number")] });
    }

    await setDailyLotteryTickets(message.member, amount);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you will now auto buy **${amount}** lottery tickets daily ($${(amount * getItems()["lottery_ticket"].buy).toLocaleString()}) at a **5%** discount`,
        ),
      ],
    });
  } else {
    return help();
  }
}

cmd.setRun(run);

module.exports = cmd;
