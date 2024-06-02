import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

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

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
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

  let amount = 1;

  if (args.length != 1) {
    amount =
      args[1].toLowerCase() === "all"
        ? Math.floor((await getBalance(message.member)) / selected.buy)
        : parseInt(args[1]);
  }

  if (!amount) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (amount < 1) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if ((await getBalance(message.member)) < selected.buy * amount) {
    return send({ embeds: [new ErrorEmbed("you cannot afford this")] });
  }

  await addCooldown(cmd.name, message.member, 7);

  await updateBalance(message.member, (await getBalance(message.member)) - selected.buy * amount);
  addStat(message.author.id, "spent-shop", selected.buy * amount);
  await addInventoryItem(message.member, selected.id, amount);

  return send({
    embeds: [
      new CustomEmbed(
        message.member,
        `you have bought **${amount.toLocaleString()}** ${selected.emoji} ${selected.name} for $${(
          selected.buy * amount
        ).toLocaleString()}`,
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
