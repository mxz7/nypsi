import dayjs = require("dayjs");
import { CommandInteraction, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import {
  addInventoryItem,
  getInventory,
  removeInventoryItem,
  selectItem,
} from "../utils/functions/economy/inventory";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { createUser, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { pluralize } from "../utils/functions/string";
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
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

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

  if (target.user.bot && !Constants.WHITELISTED_BOTS.includes(target.user.id)) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if ((await isEcoBanned(target.user.id)).banned) {
    return send({
      embeds: [new ErrorEmbed("they're banned AHAHAHAHAHAHAH everyone point and laugh")],
    });
  }

  if (!(await userExists(target))) await createUser(target);

  if (!(await userExists(message.member))) await createUser(message.member);

  if (message.author.createdTimestamp > dayjs().subtract(14, "day").valueOf()) {
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

  if (!inventory.has(selected.id)) {
    return send({
      embeds: [new ErrorEmbed("you dont have any " + selected.plural)],
    });
  }

  if (args[2]?.toLowerCase() === "all") args[2] = inventory.count(selected.id).toString();

  let amount = parseInt(args[2]);

  if (!args[2]) {
    amount = 1;
  } else {
    if (amount <= 0) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (inventory.count(selected.id) < amount) {
      return send({ embeds: [new ErrorEmbed(`you don't have enough ${selected.plural}`)] });
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
    removeInventoryItem(message.member, selected.id, amount),
  ]);

  if ((await getDmSettings(target)).payment) {
    const embed = new CustomEmbed(
      target,
      `**${message.author.username.replaceAll("_", "\\_")}** has given you ${amount.toLocaleString()} ${selected.emoji} ${
        selected.name
      }`,
    )
      .setHeader(
        `you have received ${pluralize(`${selected.article} ${selected.name}`, amount, `${amount.toLocaleString()} ${selected.plural}`)}`,
      )
      .setFooter({ text: "/settings me notifications" });

    await target
      .send({
        embeds: [embed],
        content: `you have received ${pluralize("an item", amount, `${amount.toLocaleString()} items`)}`,
      })
      .catch(() => {});
  }

  transaction(message.author, target.user, "item", amount, selected.id);

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
