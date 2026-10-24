import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  MessageFlags,
  WebhookClient,
} from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
import { a } from "../utils/functions/anticheat";
import { giveCaptcha, isLockedOut, verifyUser } from "../utils/functions/captcha";
import { addProgress } from "../utils/functions/economy/achievements.js";
import {
  addBalance,
  addBankBalance,
  getBalance,
  getBankBalance,
  getMaxBankBalance,
  removeBalance,
  removeBankBalance,
} from "../utils/functions/economy/balance.js";
import {
  addEventProgress,
  EventData,
  formatEventProgress,
  getCurrentEvent,
} from "../utils/functions/economy/events";
import { getInventory, removeInventoryItem } from "../utils/functions/economy/inventory.js";
import { createGame } from "../utils/functions/economy/stats.js";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { createUser, formatNumber, userExists } from "../utils/functions/economy/utils.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { percentChance } from "../utils/functions/random";
import { escapeFormattingCharacters } from "../utils/functions/string";
import {
  addToNypsiBank,
  getNypsiBankBalance,
  removeFromNypsiBankBalance,
} from "../utils/functions/tax.js";
import { hasAdminPermission } from "../utils/functions/users/admin";
import { addHourlyCommand } from "../utils/handlers/commandhandler";
import {
  addCooldown,
  getRemaining,
  getResponse,
  onCooldown,
} from "../utils/handlers/cooldownhandler.js";
import { getTimestamp, logger } from "../utils/logger";

const cmd = new Command("bank", "deposit, withdraw, or rob the bank", "money").setShorthands({
  deposit: "bank deposit",
  dep: "bank deposit",
  withdraw: "bank withdraw",
  with: "bank withdraw",
  bankrob: "bank rob",
});

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((sub) =>
    sub
      .setName("deposit")
      .setDescription("deposit money into your bank")
      .addStringOption((option) =>
        option.setName("amount").setDescription("amount to deposit").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("withdraw")
      .setDescription("withdraw money from your bank")
      .addStringOption((option) =>
        option.setName("amount").setDescription("amount to withdraw").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("rob").setDescription("attempt to rob a bank for a high reward"),
  );

cmd.setRun(async (message, send, args) => {
  let action = args[0]?.toLowerCase();
  let inputs = args.slice(1);

  if (!(message instanceof Message) && message.isChatInputCommand()) {
    action = message.options.getSubcommand();
    inputs = action === "rob" ? [] : [message.options.getString("amount", true)];
  }

  switch (action) {
    case "deposit":
      return runDeposit(message, send, inputs);
    case "withdraw":
      return runWithdraw(message, send, inputs);
    case "rob":
      return runRob(message, send);
    default: {
      const prefix = (await getPrefix(message.guild))[0];
      return send({
        embeds: [
          new CustomEmbed(message.member)
            .setHeader("bank commands")
            .setDescription(
              `${prefix}bank deposit <amount>\n${prefix}bank withdraw <amount>\n${prefix}bank rob`,
            ),
        ],
      });
    }
  }
});

async function runDeposit(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown("deposit", message.member)) {
    const res = await getResponse("deposit", message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("deposit help")
      .addField("usage", `${prefix}deposit <amount>`)
      .addField(
        "help",
        "you can deposit money into your bank to keep it safe from robberies (and gambling if you have *issues*)\n" +
          "however there is a limit to the size of your bank account, when starting, your bank has a capacity of $**15,000**, but will upgrade as you use the bot more.",
      );
    return send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "all") {
    args[0] = (await getBalance(message.member)).toString();
    const amount = parseInt(args[0]);
    if (
      amount >
      (await getMaxBankBalance(message.member)) - (await getBankBalance(message.member))
    ) {
      args[0] = (
        (await getMaxBankBalance(message.member)) - (await getBankBalance(message.member))
      ).toString();
    }
  }

  if (args[0] == "half") {
    args[0] = ((await getBankBalance(message.member)) / 2).toString();
  }

  const amount = formatNumber(args[0]);

  if (!amount || isNaN(amount)) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (amount > (await getBalance(message.member))) {
    return send({ embeds: [new ErrorEmbed("you cannot afford this payment")] });
  }

  if (amount > (await getMaxBankBalance(message.member)) - (await getBankBalance(message.member))) {
    return send({ embeds: [new ErrorEmbed("your bank is not big enough for this payment")] });
  }

  if (amount <= 0) {
    return send({ embeds: [new ErrorEmbed("invalid payment")] });
  }

  await addCooldown("deposit", message.member, 3);

  const embed = new CustomEmbed(message.member)
    .setHeader("bank deposit", message.author.avatarURL())
    .addField(
      "bank balance",
      "$**" +
        (await getBankBalance(message.member)).toLocaleString() +
        "** / $**" +
        (await getMaxBankBalance(message.member)).toLocaleString() +
        "**",
    )
    .addField("transaction amount", "+$**" + amount.toLocaleString() + "**");

  const m = await send({ embeds: [embed] });

  await removeBalance(message.member, amount);
  await addBankBalance(message.member, amount);

  const embed1 = new CustomEmbed(message.member)
    .setHeader("bank deposit", message.author.avatarURL())
    .addField(
      "bank balance",
      "$**" +
        (await getBankBalance(message.member)).toLocaleString() +
        "** / $**" +
        (await getMaxBankBalance(message.member)).toLocaleString() +
        "**",
    )
    .addField("transaction amount", "+$**" + amount.toLocaleString() + "**");

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  setTimeout(() => edit({ embeds: [embed1] }, m), 1500);
}

async function runWithdraw(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown("withdraw", message.member)) {
    const res = await getResponse("withdraw", message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("withdraw help")
      .addField("usage", `${prefix}withdraw <amount>`)
      .addField(
        "help",
        "you can withdraw money from your bank as long as you have that amount available in your bank",
      );
    return send({ embeds: [embed] });
  }

  if ((await getBankBalance(message.member)) == 0) {
    return send({ embeds: [new ErrorEmbed("you don't have any money in your bank account")] });
  }

  if (args[0].toLowerCase() == "all") {
    args[0] = (await getBankBalance(message.member)).toString();
  }

  if (args[0] == "half") {
    args[0] = ((await getBankBalance(message.member)) / 2).toString();
  }

  const amount = formatNumber(args[0]);

  if (amount > (await getBankBalance(message.member))) {
    return send({
      embeds: [new ErrorEmbed("you don't have enough money in your bank account")],
    });
  }

  if (!amount) {
    return send({ embeds: [new ErrorEmbed("invalid payment")] });
  }

  if (amount <= 0) {
    return send({ embeds: [new ErrorEmbed("invalid payment")] });
  }

  await addCooldown("withdraw", message.member, 3);

  const embed = new CustomEmbed(message.member)
    .setHeader("bank withdrawal", message.author.avatarURL())
    .addField(
      "bank balance",
      "$**" +
        (await getBankBalance(message.member)).toLocaleString() +
        "** / $**" +
        (await getMaxBankBalance(message.member)).toLocaleString() +
        "**",
    )
    .addField("transaction amount", "-$**" + amount.toLocaleString() + "**");

  const m = await send({ embeds: [embed] });

  await removeBankBalance(message.member, amount);
  await addBalance(message.member, amount);

  const embed1 = new CustomEmbed(message.member)
    .setHeader("bank withdrawal", message.author.avatarURL())
    .addField(
      "bank balance",
      "$**" +
        (await getBankBalance(message.member)).toLocaleString() +
        "** / $**" +
        (await getMaxBankBalance(message.member)).toLocaleString() +
        "**",
    );

  embed1.addField("transaction amount", "-$**" + amount.toLocaleString() + "**");

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  setTimeout(() => edit({ embeds: [embed1] }, m), 1500);
}

async function runRob(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if ((await getBalance(message.member)) < 5_000) {
    return send({
      embeds: [new ErrorEmbed("you must have at least $5k")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const getMaxValues = async (bankBalance: number) => {
    const [balance, inventory] = await Promise.all([
      getBalance(message.member),
      getInventory(message.member),
    ]);

    let maxLoss = balance * 0.63;
    let maxSteal = balance * 0.5;

    if (maxLoss > bankBalance * 0.6) {
      maxLoss = bankBalance * 0.7;
      maxSteal = bankBalance * 0.5;
    } else if (maxSteal < 500_000) {
      maxSteal = 500_000;
      maxLoss = balance * 0.95;
    }

    let lawyer = false;

    if (inventory.has("lawyer")) {
      lawyer = true;
      maxLoss = maxLoss * 0.35;
    }

    return { loss: Math.floor(maxLoss), steal: Math.floor(maxSteal), lawyer };
  };

  const displayBankInfo = async () => {
    const worth = await getNypsiBankBalance();
    const res = await getMaxValues(worth);
    const loss = res.loss;
    const steal = res.steal;
    const lawyer = res.lawyer;

    return `**nypsi**\n*$${worth.toLocaleString()}*\n\n**max steal** $${steal.toLocaleString()}\n**max loss** $${loss.toLocaleString()}${
      lawyer ? " 🧑‍⚖️" : ""
    }${
      (await onCooldown("bankrob", message.member))
        ? `\n\non cooldown for \`${await getRemaining("bankrob", message.member)}\``
        : ""
    }`;
  };

  const robBank = async (bank: string, interaction: ButtonInteraction, replay = false) => {
    if (await onCooldown("bankrob", message.member)) {
      if (replay) {
        if (!(await getInventory(message.member)).has("mask")) {
          interaction.reply({
            embeds: [new ErrorEmbed("you need a mask to rob again")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await removeInventoryItem(message.member, "mask", 1);
      } else {
        const res = await getResponse("bankrob", message.member);

        if (res.respond) {
          interaction.reply({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
          return;
        }
        return;
      }
    }

    if ((await getBalance(message.member)) < 5_000) {
      interaction.reply({
        embeds: [new ErrorEmbed("you must have at least $5k")],
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.deferUpdate();

    await addCooldown("bankrob", message.member, 900);

    const res = await getMaxValues(await getNypsiBankBalance());

    const loss = res.loss;
    const steal = res.steal;

    const chance = Math.floor(Math.random() * 100);

    const embed = new CustomEmbed(message.member).setHeader(
      `${message.author.username}'s robbery`,
      message.author.avatarURL(),
    );

    if (chance > 65) {
      const minStolen = Math.floor(steal * 0.5);

      const stolen = Math.floor(Math.random() * (steal - minStolen)) + minStolen;

      const promises = await Promise.all([
        addBalance(message.member, stolen),
        addProgress(message.member, "robber", 1),
        addEventProgress(message.client as NypsiClient, message.member, "rob", 1),
        addTaskProgress(message.member, "thief"),
      ]);

      const eventProgress = promises[2];

      await removeFromNypsiBankBalance(stolen);

      const id = await createGame({
        userId: message.author.id,
        bet: 0,
        result: "win",
        earned: stolen,
        game: "bankrob",
        outcome: `${message.author.username} robbed ${bank}`,
      });

      let eventData: EventData;

      if (eventProgress) {
        eventData = await getCurrentEvent();
      }

      embed.setDescription(
        `**success!**\n\n**you stole** $${stolen.toLocaleString()} from **${bank}**` +
          (eventProgress
            ? `\n\n${formatEventProgress(eventData, eventProgress, message.author.id)}`
            : ""),
      );
      embed.setColor(Constants.EMBED_SUCCESS_COLOR);
      embed.setFooter({ text: `id: ${id}` });

      return embed;
    } else {
      const inventory = await getInventory(message.member);
      let lawyer = false;

      if (inventory.has("lawyer")) {
        lawyer = true;

        await removeInventoryItem(message.member, "lawyer", 1);
      }

      const minLoss = Math.floor(loss * 0.4);
      const totalLost = Math.floor(Math.random() * (loss - minLoss)) + minLoss;

      await removeBalance(message.member, totalLost);

      await addToNypsiBank(totalLost * 0.3);

      embed.setColor(Constants.EMBED_FAIL_COLOR);

      const id = await createGame({
        userId: message.author.id,
        bet: totalLost,
        result: "lose",
        game: "bankrob",
        outcome: `${message.author.username} robbed ${bank}`,
      });
      embed.setFooter({ text: `id: ${id}` });

      if (lawyer) {
        embed.setDescription(
          `**you were caught**\n\nthanks to your lawyer, you only lost $**${totalLost.toLocaleString()}**`,
        );
      } else {
        embed.setDescription(`**you were caught**\n\nyou lost $**${totalLost.toLocaleString()}**`);
      }
    }

    return embed;
  };

  const doRob = async (msg: Message, res: ButtonInteraction, replay = false) => {
    const newEmbed = await robBank("nypsi", res, replay);

    if (!newEmbed) return msg.edit({ components: [] });

    const embed = new CustomEmbed(message.member).setHeader(
      `${message.author.username}'s robbery`,
      message.author.avatarURL(),
    );

    embed.setDescription("robbing nypsi bank...");

    await msg.edit({ embeds: [embed], components: [] });

    setTimeout(async () => {
      if (
        !(await isPremium(message.member)) ||
        !((await getTier(message.member)) >= 3) ||
        (await getBalance(message.member)) < 5_000 ||
        (await getNypsiBankBalance()) < 100_000 ||
        !(await getInventory(message.member)).has("mask")
      ) {
        return msg.edit({ embeds: [newEmbed], components: [] });
      }

      if (
        percentChance(0.05) &&
        parseInt(await redis.get(`anticheat:interactivegame:count:${message.author.id}`)) > 50
      ) {
        const res = await giveCaptcha(message.member);

        if (res) {
          logger.info(
            `${message.member.user.username} (${message.author.id}) given captcha randomly in bankrob`,
          );
          const hook = new WebhookClient({
            url: process.env.ANTICHEAT_HOOK,
          });
          await hook.send({
            content: `[${getTimestamp()}] ${escapeFormattingCharacters(message.member.user.username)} (${message.author.id}) given captcha randomly in bankrob`,
          });
          hook.destroy();
        }
      }

      await redis.incr(`anticheat:interactivegame:count:${message.author.id}`);
      await redis.expire(`anticheat:interactivegame:count:${message.author.id}`, 86400);

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("rob again")
          .setStyle(ButtonStyle.Success)
          .setCustomId("btn-play-again"),
      );

      await msg.edit({ embeds: [newEmbed], components: [row] });

      const result = await msg
        .awaitMessageComponent({
          filter: (i: Interaction) => i.user.id == message.author.id,
          time: 30000,
        })
        .catch(() => {
          msg.edit({ components: [] });
          return;
        });

      if (result && result.customId == "btn-play-again") {
        logger.info(
          `::cmd ${message.guild.id} ${message.channelId} ${message.author.username}: replaying bankrob`,
          { userId: message.author.id, guildId: message.guildId, channelId: message.channelId },
        );
        if (await isLockedOut(message.member)) return verifyUser(message);

        addHourlyCommand(message.member);

        await a(message.author.id, message.author.username, message.content, "bankrob");

        if (
          (await redis.get(
            `${Constants.redis.nypsi.RESTART}:${(message.client as NypsiClient).cluster.id}`,
          )) == "t"
        ) {
          if (message.author.id == Constants.OWNER_ID && message instanceof Message) {
            message.react("💀");
          } else {
            return msg.edit({
              embeds: [
                new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes"),
              ],
            });
          }
        }

        if (await redis.get("nypsi:maintenance")) {
          if (
            (await hasAdminPermission(message.member, "bypass-maintenance")) &&
            message instanceof Message
          ) {
            message.react("💀");
          } else {
            return msg.edit({
              embeds: [
                new CustomEmbed(
                  message.member,
                  "fun & moderation commands are still available to you. maintenance mode only prevents certain commands to prevent loss of progress",
                ).setTitle("⚠️ nypsi is under maintenance"),
              ],
            });
          }
        }

        return doRob(msg, result as ButtonInteraction, true);
      }
    }, 3000);
  };

  const embed = new CustomEmbed(message.member)
    .setHeader("bank robbery", message.author.avatarURL())
    .setDescription(await displayBankInfo());

  if ((await getNypsiBankBalance()) < 100_000) {
    return send({ embeds: [new CustomEmbed(message.member, "nypsi bank is currently closed")] });
  }

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (!(await onCooldown("bankrob", message.member)))
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("btn-rob-again")
          .setLabel("rob")
          .setStyle(ButtonStyle.Danger),
      ),
    );

  const msg = await send({ embeds: [embed], components });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const pageManager: any = async () => {
    const res = await msg
      .awaitMessageComponent({
        filter,
        time: 30000,
      })
      .catch(() => {
        msg.edit({ components: [] });
        return;
      });

    if (res && res.customId == "btn-rob-again") {
      return doRob(msg, res as ButtonInteraction);
    }
  };
  return pageManager();
}

module.exports = cmd;
