import dayjs = require("dayjs");
import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getInventory, getMaxBitcoin, getMaxEthereum, setInventory } from "../utils/functions/economy/inventory";
import { getPrestige } from "../utils/functions/economy/prestige";
import { createUser, getItems, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { getXp } from "../utils/functions/economy/xp";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { payment } from "../utils/logger";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("give", "give other users items from your inventory", Categories.MONEY);

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) => option.setName("user").setDescription("user you want to give items to").setRequired(true))
  .addStringOption((option) =>
    option.setName("item").setDescription("item you want to give").setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption((option) => option.setName("amount").setDescription("amount of item you want to give").setMinValue(1));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member).setHeader("give", message.author.avatarURL());

    embed.addField("usage", `${prefix}give <member> <item> (amount)`);
    embed.addField("help", "give members items from your inventory");

    return send({ embeds: [embed] });
  }

  let target = message.mentions.members.first();

  if (!target) {
    target = await getMember(message.guild, args[0]);
  }

  if (!target) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (message.member == target) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (target.user.bot) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (await isEcoBanned(target.user.id)) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (!(await userExists(target))) await createUser(target);

  if (!(await userExists(message.member))) await createUser(message.member);

  if (message.author.createdTimestamp > dayjs().subtract(1, "hour").unix() * 1000) {
    return send({
      embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
    });
  }

  if ((await getPrestige(message.member)) < 1) {
    if ((await getXp(message.member)) < 100) {
      return send({
        embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
      });
    }
  }

  const items = getItems();
  const inventory = await getInventory(message.member);
  const targetInventory = await getInventory(target);

  let searchTag;

  try {
    searchTag = args[1].toLowerCase();
  } catch {
    const embed = new CustomEmbed(message.member).setHeader("give", message.author.avatarURL());

    embed.addField("usage", `${prefix}give <member> <item> (amount)`);
    embed.addField("help", "give members items from your inventory");

    return send({ embeds: [embed] });
  }

  let selected;

  for (const itemName of Array.from(Object.keys(items))) {
    const aliases = items[itemName].aliases ? items[itemName].aliases : [];
    if (searchTag == itemName) {
      selected = itemName;
      break;
    } else if (searchTag == itemName.split("_").join("")) {
      selected = itemName;
      break;
    } else if (aliases.indexOf(searchTag) != -1) {
      selected = itemName;
      break;
    }
  }

  selected = items[selected];

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
  }

  if (!inventory[selected.id] || inventory[selected.id] == 0) {
    return send({ embeds: [new ErrorEmbed("you dont have any " + selected.name)] });
  }

  if (parseInt(args[2]) > 250) args[2] = "250";

  let amount = parseInt(args[2]);

  if (!args[2]) {
    amount = 1;
  } else {
    if (amount <= 0) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount > inventory[selected.id]) {
      return send({ embeds: [new ErrorEmbed(`you don't have enough ${selected.name}`)] });
    }
  }

  if (!amount) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (selected.id == "bitcoin") {
    const owned = targetInventory["bitcoin"] || 0;
    const max = await getMaxBitcoin(target);

    if (owned + amount > max) {
      return send({
        embeds: [new ErrorEmbed("you cannot give this person that much bitcoin")],
      });
    }
  } else if (selected.id == "ethereum") {
    const owned = targetInventory["ethereum"] || 0;
    const max = await getMaxEthereum(target);

    if (owned + amount > max) {
      return send({
        embeds: [new ErrorEmbed("you cannot give this person that much ethereum")],
      });
    }
  }

  const targetPrestige = await getPrestige(target);

  if (targetPrestige < 2) {
    const targetXp = await getXp(target);

    let payLimit = 150000;

    let xpBonus = targetXp * 2500;

    if (xpBonus > 1000000) xpBonus = 200000;

    payLimit += xpBonus;

    const prestigeBonus = targetPrestige * 100000;

    payLimit += prestigeBonus;

    if (amount > payLimit) {
      return send({ embeds: [new ErrorEmbed("you can't pay this user that much yet")] });
    }
  }

  await addCooldown(cmd.name, message.member, 15);

  inventory[selected.id] -= amount;

  if (inventory[selected.id] <= 0) {
    delete inventory[selected.id];
  }

  if (targetInventory[selected.id]) {
    targetInventory[selected.id] += amount;
  } else {
    targetInventory[selected.id] = amount;
  }

  await setInventory(message.member, inventory);
  await setInventory(target, targetInventory);

  payment(message.author, target.user, selected.sell * amount);

  if (selected.id == "ring") {
    return send({
      embeds: [new CustomEmbed(message.member, "you may now kiss the bride :heart:")],
    });
  }

  return send({
    embeds: [
      new CustomEmbed(
        message.member,
        `you have given **${amount}** ${selected.emoji} ${selected.name} to **${target.toString()}**`
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
