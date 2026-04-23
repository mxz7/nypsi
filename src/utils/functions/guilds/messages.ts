import { Message } from "discord.js";
import ms from "ms";
import { SnipedMessage } from "../../../types/Snipe";
import { logger } from "../../logger";
import { getLastCommand } from "./commands";

export const snipe: Map<string, SnipedMessage> = new Map();
export const eSnipe: Map<string, SnipedMessage> = new Map();

const messageCache = new Map<string, SnipedMessage[]>();

export function runSnipeClearIntervals() {
  setInterval(() => {
    const now = new Date().getTime();

    let snipeCount = 0;
    let eSnipeCount = 0;

    snipe.forEach((msg) => {
      const diff = now - msg.createdAt;

      if (diff >= 43200000) {
        snipe.delete(msg.channelId);
        snipeCount++;
      }
    });

    if (snipeCount > 0) {
      logger.info("::auto deleted " + snipeCount.toLocaleString() + " sniped messages");
    }

    eSnipe.forEach((msg) => {
      const diff = now - msg.createdAt;

      if (diff >= 43200000) {
        eSnipe.delete(msg.channelId);
        eSnipeCount++;
      }
    });

    if (eSnipeCount > 0) {
      logger.info("::auto deleted " + eSnipeCount.toLocaleString() + " edit sniped messages");
    }

    let cacheCount = 0;
    messageCache.forEach((cache) => {
      const mostRecent = cache[cache.length - 1];

      if (now - mostRecent.createdAt >= 43200000) {
        messageCache.delete(mostRecent.channelId);
        cacheCount += cache.length;
      }
    });

    if (cacheCount > 0) {
      logger.info("::auto deleted " + cacheCount.toLocaleString() + " messages from message cache");
    }
  }, 3600000);
}

export async function addToMessageCache(message: Message) {
  if (!message.author) return;
  if (message.author.bot) return;
  if (message.content.length < 1) return;

  const lastGuildCommand = await getLastCommand(message.guildId);

  if (!lastGuildCommand || lastGuildCommand.getTime() < Date.now() - ms("1 week")) {
    // don't store stuff from inactive nypsi guilds
    return;
  }

  const data: SnipedMessage = {
    id: message.id,
    content: message.content,
    user: {
      username: message.author.username,
      avatar: message.author.displayAvatarURL(),
    },
    createdAt: message.createdTimestamp,
    channelId: message.channelId,
  };

  if (!messageCache.has(message.channelId)) {
    messageCache.set(message.channelId, []);
  }

  const cache = messageCache.get(message.channelId);

  cache.push(data);

  if (cache.length > 15) {
    cache.shift();
  }
}

export function getFromMessageCache(channelId: string, messageId: string): SnipedMessage {
  const cache = messageCache.get(channelId);
  if (!cache) return null;

  return cache.find((msg) => msg.id === messageId) || null;
}
