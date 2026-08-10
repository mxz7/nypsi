import { Message, PermissionsBitField } from "discord.js";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { redisDeserialize, redisSerialize } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { MStoTime } from "../date";
import { newCase } from "../moderation/cases";
import { ChatSpamState, evaluateNypsiChatMessage } from "./chat-spam-evaluator";

const STATE_TTL_SECONDS = 30 * 60;
const STRIKE_TTL_SECONDS = 7 * 24 * 60 * 60;
// 15s, 30s, 1min, 5min, 30min, 2h, 12h, day, week
const TIMEOUT_LENGTHS = [15, 30, 60, 300, 1800, 7200, 43200, 86400, 604800];

export async function checkNypsiChatMessage(message: Message) {
  if (message.guildId !== Constants.NYPSI_SERVER_ID || message.author.bot || !message.member) {
    return;
  }

  if (message.client.user.username.includes("beta") && message.channelId != "819640200699052052") {
    // only run fake nypsi in dev channel
    return;
  }

  const stateKey = `nypsi:chat-spam:state:${message.author.id}`;
  const rawState = await redis.get(stateKey);

  let state: ChatSpamState;

  try {
    state = rawState ? redisDeserialize<ChatSpamState>(rawState) : undefined;
  } catch {
    state = undefined;
  }

  const evaluation = evaluateNypsiChatMessage(message.content, message.createdTimestamp, state);

  await redis.set(stateKey, redisSerialize(evaluation.state), "EX", STATE_TTL_SECONDS);

  if (evaluation.pointsAdded > 0) {
    logger.debug(`spam: score increased for ${message.author.id} (${message.author.username})`, {
      causes: evaluation.causes,
      channelId: message.channelId,
      content: message.content,
      pointsAdded: evaluation.pointsAdded,
      scoreAfter: evaluation.scoreAfter,
      scoreBefore: evaluation.scoreBefore,
    });
  }

  if (!evaluation.shouldTimeout) return;

  if (message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    logger.info(`spam: would punish ${message.member.user.id} but is staff`);
    return;
  }

  const lockKey = `nypsi:chat-spam:timeout-lock:${message.author.id}`;
  const acquiredLock = await redis.set(lockKey, 1, "EX", 30, "NX");

  if (!acquiredLock) return;

  const strikeKey = `nypsi:chat-spam:strikes:${message.author.id}`;
  const strikes = await redis.incr(strikeKey);

  await redis.expire(strikeKey, STRIKE_TTL_SECONDS);

  const length = TIMEOUT_LENGTHS[Math.min(strikes - 1, TIMEOUT_LENGTHS.length - 1)];
  const expiresAt = new Date(Date.now() + length * 1000);

  if (!message.member.moderatable) {
    logger.warn(`spam: unable to timeout chat spammer ${message.author.id}`);
    return;
  }

  const reason = `automatic chat spam timeout - ${MStoTime(length * 1000, true).trim()}`;

  await message.member.disableCommunicationUntil(expiresAt, reason);
  await message.delete().catch(() => {});
  await newCase(
    message.guild,
    "mute",
    message.author.id,
    message.client.user,
    `[${MStoTime(length * 1000, true).trim()}] chat spam (automatic)`,
  );

  logger.info(
    `::auto spam: ${message.author.id} (${message.author.username}) timeout ${length}s (strike ${strikes})`,
  );

  const embed = new CustomEmbed()
    .setTitle(`muted in ${message.guild.name}`)
    .addField("length", `\`${MStoTime(length * 1000, true).trim()}\``, true)
    .addField("reason", "chat spam", true)
    .setFooter({ text: "unmuted at:" })
    .setTimestamp(expiresAt)
    .setColor(Constants.EMBED_FAIL_COLOR);

  await message.member.send({ embeds: [embed] }).catch(() => {});
}
