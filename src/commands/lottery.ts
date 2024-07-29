import dayjs = require("dayjs");
import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
import { getTicketCount } from "../utils/functions/economy/lottery";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";

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

    const winChance = ((tickets / (await getTicketCount())) * 100 || 0).toPrecision(3);

    embed.setHeader("lottery", message.author.avatarURL());
    embed.setDescription(
      `nypsi lottery is a daily draw which happens in the [official nypsi server](https://discord.gg/hJTDNST)\nnext draw <t:${dayjs()
        .add(1, "day")
        .startOf("day")
        .unix()}:R>\n\n` +
        `you can buy lottery tickets with ${(await getPrefix(message.guild))[0]}**buy lotto**\nyou have **${tickets.toLocaleString()}** tickets (${winChance}% chance of winning)`,
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
  } else {
    return help();
  }
}

cmd.setRun(run);

module.exports = cmd;
