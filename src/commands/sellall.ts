import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getBalance, getMulti, updateBalance } from "../utils/functions/economy/balance";
import { getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("sellall", "sell all commonly sold items", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  const items = getItems();

  const inventory = await getInventory(message.member);

  const selected = new Map<string, number>();

  for (const item of inventory) {
    if (items[item.item].role == "fish" || items[item.item].role == "prey" || items[item.item].role == "sellable") {
      if (items[item.item].id == "cookie" || items[item.item].id == "cake") continue;
      selected.set(item.item, inventory.find((i) => i.item == item.item).amount);
    } else if (items[item.item].id.includes("watch")) {
      selected.set(item.item, inventory.find((i) => i.item == item.item).amount);
    }
  }

  if (selected.size == 0) {
    return send({ embeds: [new ErrorEmbed("you do not have anything to sell")] });
  }

  await addCooldown(cmd.name, message.member, 30);

  const multi = await getMulti(message.member);

  let total = 0;
  let taxedAmount = 0;

  const tax = await getTax();
  let taxEnabled = true;

  if ((await isPremium(message.member)) && (await getTier(message.member)) == 4) taxEnabled = false;

  const promises = [];
  const desc: string[] = [];
  const amounts = new Map<string, number>();

  for (const item of selected.keys()) {
    promises.push(setInventoryItem(message.member, item, 0, false));

    let sellWorth = Math.floor(items[item].sell * selected.get(item));

    if (items[item].role == "fish" || items[item].role == "prey" || items[item].role == "sellable") {
      sellWorth = Math.floor(sellWorth + sellWorth * multi);
    }

    if (taxEnabled) {
      taxedAmount += Math.floor(sellWorth * tax);
      sellWorth = sellWorth - Math.floor(sellWorth * tax);
    }

    total += sellWorth;

    desc.push(`${items[item].emoji} ${items[item].name} +$${sellWorth.toLocaleString()} (${selected.get(item)})`);
    amounts.set(
      `${items[item].emoji} ${items[item].name} +$${sellWorth.toLocaleString()} (${selected.get(item)})`,
      sellWorth
    );
  }

  promises.push(addToNypsiBank(taxedAmount));
  promises.push(updateBalance(message.member, (await getBalance(message.member)) + total));

  await Promise.all(promises);

  inPlaceSort(desc).desc((i) => amounts.get(i));

  const embed = new CustomEmbed(message.member);

  embed.setDescription(`+$**${total.toLocaleString()}**\n\n${desc.join("\n")}`);
  if (taxEnabled) embed.setFooter({ text: `${((await getTax()) * 100).toFixed(1)}% tax` });

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
