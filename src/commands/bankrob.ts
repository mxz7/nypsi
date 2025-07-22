import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
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
import { addBalance, getBalance, removeBalance } from "../utils/functions/economy/balance.js";
import { addEventProgress, EventData, getCurrentEvent } from "../utils/functions/economy/events";
import { getInventory, removeInventoryItem } from "../utils/functions/economy/inventory.js";
import { createGame } from "../utils/functions/economy/stats.js";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { createUser, userExists } from "../utils/functions/economy/utils.js";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { percentChance } from "../utils/functions/random";
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

const cmd = new Command("bankrob", "attempt to rob a bank for a high reward", "money");

cmd.slashEnabled = true;

async function run(
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
      (await onCooldown(cmd.name, message.member))
        ? `\n\non cooldown for \`${await getRemaining(cmd.name, message.member)}\``
        : ""
    }`;
  };

  const robBank = async (bank: string, interaction: ButtonInteraction, replay = false) => {
    if (await onCooldown(cmd.name, message.member)) {
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
        const res = await getResponse(cmd.name, message.member);

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

    await addCooldown(cmd.name, message.member, 900);

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

      const eventData: { event?: EventData; target: number } = { target: 0 };

      if (eventProgress) {
        eventData.event = await getCurrentEvent();

        if (eventData.event) {
          eventData.target = Number(eventData.event.target);
        }
      }

      embed.setDescription(
        `**success!**\n\n**you stole** $${stolen.toLocaleString()} from **${bank}**` +
          (eventProgress
            ? `\n\n🔱${eventProgress.toLocaleString()}/${eventData.target.toLocaleString()}`
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
            content: `[${getTimestamp()}] ${message.member.user.username} (${message.author.id}) given captcha randomly in bankrob`,
          });
          hook.destroy();
        }
      }

      await redis.incr(`anticheat:interactivegame:count:${message.author.id}`);
      await redis.expire(`anticheat:interactivegame:count:${message.author.id}`, 86400);

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setLabel("rob again").setStyle(ButtonStyle.Success).setCustomId("rp"),
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

      if (result && result.customId == "rp") {
        logger.info(
          `::cmd ${message.guild.id} ${message.channelId} ${message.author.username}: replaying bankrob`,
        );
        if (await isLockedOut(message.member)) return verifyUser(message);

        addHourlyCommand(message.member);

        await a(message.author.id, message.author.username, message.content, "bankrob");

        if (
          (await redis.get(
            `${Constants.redis.nypsi.RESTART}:${(message.client as NypsiClient).cluster.id}`,
          )) == "t"
        ) {
          if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
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

  if (!(await onCooldown(cmd.name, message.member)))
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ro").setLabel("rob").setStyle(ButtonStyle.Danger),
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

    if (res && res.customId == "ro") {
      return doRob(msg, res as ButtonInteraction);
    }
  };
  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
