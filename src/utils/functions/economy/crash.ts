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
import { CustomEmbed, ErrorEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { calcMaxBet, getBalance, removeBalance } from "./balance";
import { formatUsername } from "./top";
import { formatBet, formatNumber } from "./utils";

export interface CrashStatus {
  state: "waiting" | "started";
  messageId: string;
  players: { userId: string; username: string; bet: number; autoStop?: number; joinedAt: number }[];
}

const waitingButtons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
  new ButtonBuilder().setCustomId("crash-join").setLabel("join").setStyle(ButtonStyle.Success),
  new ButtonBuilder()
    .setURL("https://docs.nypsi.xyz/economy/crash")
    .setStyle(ButtonStyle.Link)
    .setLabel("docs"),
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
  let status = await getCrashStatus();

  if (status.state === "waiting" && status.players.length === 0) return;

  status = {
    state: "waiting",
    messageId: "",
    players: [],
  };

  await setCrashStatus(status);

  await render(client);
}

async function render(client: NypsiClient) {
  const status = await getCrashStatus();

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

      if (!embed.data.fields || embed.data.fields?.length === 0) {
        embed.addField(
          "players",
          `${await formatUsername(player.userId, player.username, true)} $${formatNumber(player.bet)}\n`,
          true,
        );
      } else {
        let text = embed.data.fields[embed.data.fields.length - 1].value;

        if (text.split("\n").length >= 5) {
          embed.addField(
            "players",
            `${await formatUsername(player.userId, player.username, true)} $${formatNumber(player.bet)}\n`,
            true,
          );
        } else {
          text += `${await formatUsername(player.userId, player.username, true)} $${formatNumber(player.bet)}\n`;
        }
      }
    }

    embed.setDescription("starting <t:" + Math.floor(lastJoin / 1000) + 30 + ":R>");
  }

  const channel = client.channels.cache.get(Constants.CRASH_CHANNEL) as TextBasedChannel;

  if (!channel.isSendable()) return;

  let message: Message;
  if (status.messageId) {
    message = await channel.messages.fetch(status.messageId);
  }

  if (!message) {
    const newMsg = await channel.send({ embeds: [embed], components: [waitingButtons] });

    status.messageId = newMsg.id;

    return setCrashStatus(status);
  }

  return message.edit({ embeds: [embed], components: [waitingButtons] });
}

export async function addCrashPlayer(interaction: ButtonInteraction) {
  const status = await getCrashStatus();

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
    .setTitle("modal")
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

  await interaction.showModal(modal);

  const modalInteraction = await interaction
    .awaitModalSubmit({
      time: 30000,
      filter: (i) => i.user.id === interaction.user.id,
    })
    .catch(() => {});

  if (!modalInteraction) return;
  if (!modalInteraction.isModalSubmit()) return;

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

  await removeBalance(interaction.user.id, bet);

  status.players.push({
    userId: interaction.user.id,
    username: interaction.user.username,
    bet,
    autoStop: autoStop ? parseFloat(autoStop) : undefined,
    joinedAt: Date.now(),
  });

  await setCrashStatus(status);

  render(interaction.client as NypsiClient);

  return modalInteraction.reply({
    embeds: [new CustomEmbed(interaction.user.id, "✅ joined game")],
    ephemeral: true,
  });
}
