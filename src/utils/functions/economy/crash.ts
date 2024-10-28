import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  MessageActionRowComponentBuilder,
  TextBasedChannel,
} from "discord.js";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { formatNumber } from "./utils";

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
  const status: CrashStatus = {
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

      if (embed.data.fields.length === 0) {
        embed.addField("players", `**${player.username}** | $${formatNumber(player.bet)}\n`, true);
      } else {
        let text = embed.data.fields[embed.data.fields.length - 1].value;

        if (text.split("\n").length >= 5) {
          embed.addField(
            "players",
            `**${player.username}** | $${formatNumber(player.bet)}\n`,
            true,
          );
        } else {
          text += `**${player.username}** | $${formatNumber(player.bet)}\n`;
        }
      }
    }

    embed.setDescription("starting <t:" + lastJoin + ":R>");
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
