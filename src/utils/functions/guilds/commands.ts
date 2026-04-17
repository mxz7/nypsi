import ms from "ms";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { Mutex } from "../mutex";

const lastCommand = new Map<string, { timestamp: number; storedAt: number }>();

setInterval(() => {
  for (const [guildId, data] of lastCommand.entries()) {
    if (Date.now() - data.storedAt > ms("12 hours")) {
      lastCommand.delete(guildId);
    }
  }
}, ms("15 minutes"));

export function getLastCommandSync(guildId: string) {
  const data = lastCommand.get(guildId);

  if (!data) {
    (async () => {
      const lastCommandDate = await getLastCommand(guildId);

      lastCommand.set(guildId, {
        timestamp: lastCommandDate ? lastCommandDate.getTime() : 0,
        storedAt: Date.now(),
      });
    })();
    return null;
  }

  lastCommand.set(guildId, { timestamp: data.timestamp, storedAt: Date.now() });

  return data.timestamp;
}

const cache = new RedisCache<number | string>(Constants.redis.cache.guild.LAST_COMMAND, 3600);
const mutex = new Mutex();

export async function getLastCommand(guildId: string) {
  await mutex.acquire(guildId);

  try {
    const cacheValue = await cache.get(guildId);

    if (cacheValue) {
      if (cacheValue === "null") {
        return null;
      }

      return new Date(cacheValue);
    }

    const query = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { lastCommand: true },
    });

    cache.set(guildId, query?.lastCommand.getTime() || "null");

    return query?.lastCommand || null;
  } finally {
    mutex.release(guildId);
  }
}

export function setLastCommand(guildId: string, timestamp: number) {
  lastCommand.set(guildId, { timestamp, storedAt: Date.now() });
}
