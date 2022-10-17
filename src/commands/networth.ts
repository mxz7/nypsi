import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getAuctionAverage } from "../utils/functions/economy/auctions";
import { getBalance, getBankBalance } from "../utils/functions/economy/balance";
import { getGuildByUser } from "../utils/functions/economy/guilds";
import { getInventory } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";

const cmd = new Command("networth", "view your net worth", Categories.MONEY).setAliases(["net"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 30);

  const items = getItems();

  const inventory = await getInventory(message.member);
  const guild = await getGuildByUser(message.member);

  const money = (await getBalance(message.member)) + (await getBankBalance(message.member));
  let inventoryWorth = 0;
  let guildWorth = 0;

  for (const item of inventory) {
    const averageAuction = await getAuctionAverage(item.item);

    if (averageAuction) {
      inventoryWorth += Math.floor(averageAuction * inventory.find((i) => i.item == item.item).amount);
    } else if (items[item.item].sell) {
      inventoryWorth += items[item.item].sell * inventory.find((i) => i.item == item.item).amount;
    }
  }

  if (guild) {
    guildWorth = guild.balance;
  }

  const total = Math.floor(guildWorth + inventoryWorth + money);

  if (total == 0) {
    return message.channel.send({ embeds: [new CustomEmbed(message.member, "damn bro ur broke. $0 net worth lol!")] });
  }

  let description = `🌍 $**${total.toLocaleString()}**\n\n`;

  if (money > 0) {
    description += ` -- 💳 $**${Math.floor(money).toLocaleString()}**\n`;
  }

  if (inventoryWorth > 0) {
    description += ` -- 🎒 $**${Math.floor(inventoryWorth).toLocaleString()}**\n`;
  }

  if (guildWorth > 0) {
    description += ` -- 👥 $**${Math.floor(guildWorth).toLocaleString()}**`;
  }

  const embed = new CustomEmbed(message.member, description).setHeader("your net worth", message.author.avatarURL());

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
