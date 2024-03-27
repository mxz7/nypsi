import dayjs = require("dayjs");
import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import {
  addInventoryItem,
  getInventory,
  selectItem,
  setInventoryItem,
} from "../utils/functions/economy/inventory";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { createUser, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { getDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { transaction } from "../utils/logger";

const cmd = new Command("give", "give other users items from your inventory", "money");

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) =>
    option.setName("user").setDescription("user you want to give items to").setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("item")
      .setDescription("item you want to give")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addIntegerOption((option) =>
    option.setName("amount").setDescription("amount of item you want to give").setMinValue(1),
  );

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member).setHeader("give", message.author.avatarURL());

    embed.addField("usage", `${prefix}give <member> <item> (amount)`);
    embed.addField("help", "give members items from your inventory");

    return send({ embeds: [embed] });
  }

  const target = await getMember(message.guild, args[0]);

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

  if (message.author.createdTimestamp > dayjs().subtract(1, "day").unix() * 1000) {
    return send({
      embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
    });
  }

  if ((await getRawLevel(message.member)) < 3) {
    return send({
      embeds: [new ErrorEmbed("you must be level 3 before you can give items")],
    });
  }

  const inventory = await getInventory(message.member);

  let searchTag;

  try {
    searchTag = args[1].toLowerCase();
  } catch {
    const embed = new CustomEmbed(message.member).setHeader("give", message.author.avatarURL());

    embed.addField("usage", `${prefix}give <member> <item> (amount)`);
    embed.addField("help", "give members items from your inventory");

    return send({ embeds: [embed] });
  }

  const selected = selectItem(searchTag);

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
  }

  if (
    !inventory.find((i) => i.item == selected.id) ||
    inventory.find((i) => i.item == selected.id).amount == 0
  ) {
    return send({ embeds: [new ErrorEmbed("you dont have any " + selected.plural)] });
  }

  if (args[2]?.toLowerCase() === "all")
    args[2] = inventory.find((i) => i.item === selected.id).amount.toString();

  let amount = parseInt(args[2]);

  if (!args[2]) {
    amount = 1;
  } else {
    if (amount <= 0) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount > inventory.find((i) => i.item == selected.id).amount) {
      return send({ embeds: [new ErrorEmbed(`you don't have enough ${selected.name}`)] });
    }
  }

  if (!amount) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (selected.account_locked) {
    return send({ embeds: [new ErrorEmbed("this item is locked to your account")] });
  }

  await addCooldown(cmd.name, message.member, 5);

  await Promise.all([
    addInventoryItem(target, selected.id, amount),
    setInventoryItem(
      message.member,
      selected.id,
      inventory.find((i) => i.item == selected.id).amount - amount,
    ),
  ]);

  if ((await getDmSettings(target)).payment) {
    const embed = new CustomEmbed(
      target,
      `**${message.author.username}** has given you ${amount.toLocaleString()} ${selected.emoji} ${
        selected.name
      }`,
    )
      .setHeader(
        `you have received ${amount == 1 ? `${selected.article || "a"} ${selected.name}` : `${amount.toLocaleString()} ${selected.plural}`}`,
      )
      .setFooter({ text: "/settings me notifications" });

    await target
      .send({
        embeds: [embed],
        content: `you have received ${
          amount == 1 ? "an item" : `${amount.toLocaleString()} items`
        }`,
      })
      .catch(() => {});
  }

  transaction(message.author, target.user, `${selected.id} x ${amount}`);

  if (selected.id == "ring") {
    return send({
      embeds: [new CustomEmbed(message.member, "you may now kiss the bride :heart:")],
    });
  }

  return send({
    embeds: [
      new CustomEmbed(
        message.member,
        `you have given **${amount}** ${selected.emoji} ${
          selected.name
        } to **${target.toString()}**`,
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
