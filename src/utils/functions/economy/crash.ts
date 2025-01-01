import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Message,
  MessageActionRowComponentBuilder,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  TextBasedChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { NypsiMessage } from "../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { a } from "../anticheat";
import { giveCaptcha, isLockedOut, verifyUser } from "../captcha";
import { percentChance } from "../random";
import sleep from "../sleep";
import { addBalance, calcMaxBet, getBalance, getGambleMulti, removeBalance } from "./balance";
import { addToGuildXP, getGuildName } from "./guilds";
import { createGame } from "./stats";
import { formatUsername } from "./top";
import { formatBet, formatNumberPretty } from "./utils";
import { addXp, calcEarnedGambleXp } from "./xp";

export interface CrashStatus {
  state: "waiting" | "started" | "ended";
  messageId: string;
  players: {
    userId: string;
    username: string;
    bet: number;
    autoStop?: number;
    joinedAt: number;
    stoppedAt?: number;
    won?: number;
  }[];
  value: number;
  chance: number;
}

let ready = false;
let startTimeout: NodeJS.Timeout;

const waitingButtons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
  new ButtonBuilder().setCustomId("crash-join").setLabel("join").setStyle(ButtonStyle.Success),
  new ButtonBuilder()
    .setURL("https://nypsi.xyz/docs/economy/crash")
    .setStyle(ButtonStyle.Link)
    .setLabel("docs"),
);
const startedButtons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
  new ButtonBuilder().setCustomId("crash-out").setLabel("cash out").setStyle(ButtonStyle.Success),
);

export async function getCrashStatus(): Promise<CrashStatus | null> {
  const status = await redis.get(Constants.redis.nypsi.CRASH_STATUS);

  if (status) {
    return JSON.parse(status);
  }

  return null;
}

export async function setCrashStatus(status: CrashStatus) {
  await redis.set(Constants.redis.nypsi.CRASH_STATUS, JSON.stringify(status));
}

export async function initCrashGame(client: NypsiClient) {
  ready = true;
  let status = await getCrashStatus();

  if (status && status.state === "waiting" && status.players.length === 0) return;

  status = {
    state: "waiting",
    messageId: "",
    players: [],
    chance: 15,
    value: 1,
  };

  await setCrashStatus(status);

  await render(client);
}

async function render(client: NypsiClient, status?: CrashStatus) {
  if (!status) status = await getCrashStatus();

  if (!status) return;

  const embed = new CustomEmbed()
    .setColor(Constants.PURPLE)
    .setHeader("crash", client.user.avatarURL());

  if (status.players.length === 0) {
    embed.setDescription("waiting for players...");
  } else {
    let lastJoin = 0;
    for (const player of status.players) {
      if (player.joinedAt > lastJoin) lastJoin = player.joinedAt;

      let text = `${await formatUsername(player.userId, player.username, true)} $${formatNumberPretty(player.bet)}\n`;

      if (player.stoppedAt && player.stoppedAt > 1) {
        text = `:green_circle: ${await formatUsername(player.userId, player.username, true)} +$${formatNumberPretty(player.won)} (\`${player.stoppedAt.toFixed(2)}x\`)\n`;
      } else if (player.stoppedAt && player.stoppedAt <= 1) {
        text = `:red_circle: ${await formatUsername(player.userId, player.username, true)} +$${formatNumberPretty(player.won)} (\`${player.stoppedAt.toFixed(2)}x\`)\n`;
      } else if (!player.stoppedAt && status.state === "ended") {
        text = `:red_circle: ${await formatUsername(player.userId, player.username, true)} $${formatNumberPretty(player.bet)}\n`;
      }

      if (!embed.data.fields || embed.data.fields?.length === 0) {
        embed.addField("players", text, true);
      } else {
        const fieldText = embed.data.fields[embed.data.fields.length - 1].value;

        if (fieldText.split("\n").length >= 6) {
          embed.addField("players", text, true);
        } else {
          embed.data.fields[embed.data.fields.length - 1].value += text;
        }
      }
    }

    if (status.state === "waiting") {
      embed.setDescription(`starting <t:${Math.floor(lastJoin / 1000) + 15}:R>`);
    } else if (status.state === "started") {
      embed.setColor(Constants.EMBED_SUCCESS_COLOR);
      embed.setDescription(`\`${status.value.toFixed(2)}x\``);
    } else if (status.state === "ended") {
      embed.setColor(Constants.EMBED_FAIL_COLOR);
      embed.setDescription(`**CRASHED**\n\n\`${status.value.toFixed(2)}x\``);
    }
  }

  const channel = client.channels.cache.get(Constants.CRASH_CHANNEL) as TextBasedChannel;

  if (!channel.isSendable()) return;

  let message: Message;
  if (status.messageId) {
    message = await channel.messages.fetch(status.messageId);
  }

  let components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (status.state === "waiting") {
    components = [waitingButtons];
  } else if (status.state === "started") {
    components = [startedButtons];
  } else if (status.state === "ended") {
    components = [];
  }

  if (!message) {
    const newMsg = await channel.send({ embeds: [embed], components });

    status.messageId = newMsg.id;

    return setCrashStatus(status);
  }

  return message.edit({ embeds: [embed], components });
}

export async function crashOut(interaction: ButtonInteraction) {
  const status = await getCrashStatus();

  if (!status) return;
  if (status.state !== "started") return;
  if (!status.players.find((p) => p.userId === interaction.user.id)) return;

  status.players.find((i) => i.userId === interaction.user.id).stoppedAt = 1;
  await setCrashStatus(status);
  interaction.deferUpdate();
}

export async function addCrashPlayer(interaction: ButtonInteraction) {
  if (!ready)
    return interaction.reply({ embeds: [new ErrorEmbed("crash not ready yet")], ephemeral: true });
  let status = await getCrashStatus();

  if (!status) return;
  if (status.state !== "waiting") return;

  if (status.players.find((p) => p.userId === interaction.user.id)) {
    return interaction.reply({
      embeds: [new ErrorEmbed("you have already joined")],
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId("crash-join-modal")
    .setTitle("join crash")
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder()
          .setLabel("bet")
          .setRequired(true)
          .setCustomId("bet")
          .setStyle(TextInputStyle.Short),
      ),
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder()
          .setLabel("auto stop")
          .setCustomId("auto-stop")
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
    );

  a(interaction.user.id, interaction.user.username, "crash", "crash");

  if (await isLockedOut(interaction.user.id)) {
    const message = interaction as unknown as NypsiMessage;

    message.author = interaction.user;
    message.content = "crash";
    return verifyUser(message);
  } else if (percentChance(2)) {
    giveCaptcha(interaction.user.id);
  }

  await interaction.showModal(modal);

  const modalInteraction = await interaction
    .awaitModalSubmit({
      time: 30000,
      filter: (i) => i.user.id === interaction.user.id,
    })
    .catch(() => {});

  if (!modalInteraction) return;
  if (!modalInteraction.isModalSubmit()) return;

  status = await getCrashStatus();

  if (status.state !== "waiting")
    return modalInteraction.reply({
      embeds: [new ErrorEmbed("this game has already started")],
      ephemeral: true,
    });

  if (status.players.length >= 15)
    return modalInteraction.reply({
      embeds: [new ErrorEmbed("this game is full")],
      ephemeral: true,
    });

  if (status.players.find((p) => p.userId === interaction.user.id)) {
    return interaction.reply({
      embeds: [new ErrorEmbed("you have already joined")],
      ephemeral: true,
    });
  }

  const betValue = modalInteraction.fields.getTextInputValue("bet");
  const autoStop = modalInteraction.fields.getTextInputValue("auto-stop");

  const bet = await formatBet(betValue, interaction.user.id);
  const maxBet = await calcMaxBet(interaction.user.id);

  if (!bet || bet <= 0) {
    return modalInteraction.reply({ embeds: [new ErrorEmbed("invalid bet")], ephemeral: true });
  }

  if (bet > (await getBalance(interaction.user.id))) {
    return modalInteraction.reply({
      embeds: [new ErrorEmbed("you cannot afford this bet")],
      ephemeral: true,
    });
  }

  if (bet > maxBet) {
    return modalInteraction.reply({
      embeds: [
        new ErrorEmbed(
          `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`,
        ),
      ],
      ephemeral: true,
    });
  }

  if (autoStop) {
    if (typeof parseFloat(autoStop) === "number") {
      if (parseFloat(autoStop) <= 1)
        return modalInteraction.reply({
          ephemeral: true,
          embeds: [new ErrorEmbed("your autostop must be higher than 1")],
        });

      if (parseFloat(autoStop) > 100) {
        return modalInteraction.reply({
          ephemeral: true,
          embeds: [new ErrorEmbed("invalid autostop")],
        });
      }
    }

    if (isNaN(parseFloat(autoStop))) {
      return modalInteraction.reply({
        ephemeral: true,
        embeds: [new ErrorEmbed("invalid autostop")],
      });
    }
  }

  logger.debug(`crash: ${interaction.user.username} remving balance`);
  await removeBalance(interaction.user.id, bet);

  status = await getCrashStatus();

  if (status.players.find((p) => p.userId === interaction.user.id)) {
    logger.debug(`crash: ${interaction.user.username} already joined`, status);
    await addBalance(interaction.user.id, bet);
    return interaction.reply({
      embeds: [new ErrorEmbed("you have already joined")],
      ephemeral: true,
    });
  }

  status.players.push({
    userId: interaction.user.id,
    username: interaction.user.username,
    bet,
    autoStop: autoStop ? parseFloat(autoStop) : undefined,
    joinedAt: Date.now(),
  });

  await setCrashStatus(status);

  render(interaction.client as NypsiClient);

  clearTimeout(startTimeout);
  startTimeout = setTimeout(() => {
    start(interaction.client as NypsiClient);
  }, 15000);

  logger.info(`crash: ${interaction.user.username} joined`, status);

  return modalInteraction.reply({
    embeds: [
      new CustomEmbed(
        interaction.user.id,
        "✅ joined game\n\n" +
          `**bet** $${bet.toLocaleString()}${autoStop ? `\n**auto stop** \`${parseFloat(autoStop).toFixed(2)}x\`` : ""}`,
      ),
    ],
    ephemeral: true,
  });
}

async function start(client: NypsiClient) {
  const status = await getCrashStatus();

  status.state = "started";

  await setCrashStatus(status);

  await render(client, status);
  await sleep(1000);

  const formulas = [
    (i: number) => {
      if (i < 1) i += 0.05;
      return i * 1.17;
    },
    (i: number) => {
      if (i < 1) i += 0.04;
      return i * 1.17771;
    },
    (i: number) => {
      if (i < 1) i += 0.045;
      return i * 1.17779;
    },
  ];

  function doGame() {
    if (percentChance(status.chance)) {
      return true;
    }

    status.value = formulas[Math.floor(Math.random() * formulas.length)](status.value);

    status.chance += 2.2;
    if (status.value >= 1.5) status.chance += 1;
    if (status.value >= 2) status.chance += 1;

    if (status.chance > 50) status.chance = 45;

    return false;
  }

  while (status.state === "started") {
    const res = doGame();

    const newStatus = await getCrashStatus();

    for (const player of newStatus.players) {
      if (player.stoppedAt && !status.players.find((p) => p.userId === player.userId).stoppedAt) {
        status.players.find((p) => p.userId === player.userId).stoppedAt = 1;
      }
    }

    for (const player of status.players) {
      if (player.stoppedAt && !player.won) {
        player.won = Math.round(player.bet * status.value);
        player.stoppedAt = status.value;

        logger.info(
          `crash: ${player.username} stopped via button (${status.value.toFixed(2)})`,
          status,
        );

        if (player.stoppedAt > 1) {
          const [xp, { multi }] = await Promise.all([
            calcEarnedGambleXp(player.userId, player.bet, player.stoppedAt),
            getGambleMulti(player.userId),
          ]);

          if (multi > 0) player.won = player.won + Math.round(player.won * multi);
          addBalance(player.userId, player.won);

          createGame({
            userId: player.userId,
            bet: player.bet,
            game: "crash",
            result: "win",
            outcome: status.value.toFixed(2),
            earned: player.won,
            xp: xp,
          });

          if (xp > 0) {
            addXp(player.userId, xp);
            const guild = await getGuildName(player.userId);
            if (guild) await addToGuildXP(guild, xp, player.userId);
          }
        } else {
          createGame({
            userId: player.userId,
            bet: player.bet,
            game: "crash",
            result: "lose",
            outcome: status.value.toFixed(2),
            earned: player.won,
          });
          addBalance(player.userId, player.won);
        }
      } else if (player.autoStop && player.autoStop <= status.value && !player.won) {
        player.stoppedAt = player.autoStop;
        player.won = Math.round(player.bet * player.stoppedAt);

        logger.info(
          `crash: ${player.username} stopped via autostop (${player.autoStop.toFixed(2)})`,
        );

        if (player.stoppedAt > 1) {
          const [xp, { multi }] = await Promise.all([
            calcEarnedGambleXp(player.userId, player.bet, player.stoppedAt),
            getGambleMulti(player.userId),
          ]);

          if (multi > 0) player.won = player.won + Math.round(player.won * multi);
          addBalance(player.userId, player.won);

          createGame({
            userId: player.userId,
            bet: player.bet,
            game: "crash",
            result: "win",
            outcome: status.value.toFixed(2),
            earned: player.won,
            xp: xp,
          });

          if (xp > 0) {
            addXp(player.userId, xp);
            const guild = await getGuildName(player.userId);
            if (guild) await addToGuildXP(guild, xp, player.userId);
          }
        } else {
          createGame({
            userId: player.userId,
            bet: player.bet,
            game: "crash",
            result: "lose",
            outcome: status.value.toFixed(2),
            earned: player.won,
          });
        }
      }
    }

    if (res) {
      status.state = "ended";

      for (const player of status.players) {
        if (!player.won) {
          player.stoppedAt = undefined;
          await createGame({
            userId: player.userId,
            bet: player.bet,
            game: "crash",
            result: "lose",
            outcome: status.value.toFixed(2),
          });
        }
      }

      logger.info(`crash: game ended`, status);

      await setCrashStatus(status);

      await render(client, status);

      setTimeout(() => {
        initCrashGame(client);
      }, 5000);
    } else {
      await render(client, status);
      await sleep(1000);
    }
  }
}
