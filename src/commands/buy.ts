import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { getInventory, setInventory } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("buy", "buy items from the shop", Categories.MONEY);

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option.setName("item-buy").setRequired(true).setAutocomplete(true).setDescription("item you want to buy")
  )
  .addIntegerOption((option) => option.setMinValue(1).setName("amount").setDescription("amount you want to buy"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
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

  if (args.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `buy items from ${await getPrefix(message.guild)}shop by using the item id or item name without spaces`
        ),
      ],
    });
  }

  const items = getItems();
  const inventory = await getInventory(message.member);

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
    amount = parseInt(args[1]);
  }

  if (!amount) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (amount < 1) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (amount > 250) amount = 250;

  if ((await getBalance(message.member)) < selected.buy * amount) {
    return send({ embeds: [new ErrorEmbed("you cannot afford this")] });
  }

  await addCooldown(cmd.name, message.member, 7);

  await updateBalance(message.member, (await getBalance(message.member)) - selected.buy * amount);
  inventory[selected.id] + amount;

  if (inventory[selected.id]) {
    inventory[selected.id] += amount;
  } else {
    inventory[selected.id] = amount;
  }

  await setInventory(message.member, inventory);

  return send({
    embeds: [
      new CustomEmbed(
        message.member,
        `you have bought **${amount.toLocaleString()}** ${selected.emoji} ${selected.name} for $${(
          selected.buy * amount
        ).toLocaleString()}`
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
