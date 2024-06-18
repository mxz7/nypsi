import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

export async function getMaxEvidenceBytes(guild: Guild) {
  const cache = await redis.get(`${Constants.redis.cache.guild.EVIDENCE_MAX}:${guild.id}`);

  if (cache) {
    return parseInt(cache);
  }

  const query = await prisma.guildEvidenceCredit.findMany({
    where: {
      guildId: guild.id,
    },
  });

  const base = Constants.EVIDENCE_BASE;
  let total = base;

  if (query.length > 0) total += Number(query.map((a) => a.bytes).reduce((a, b) => a + b));

  await redis.set(`${Constants.redis.cache.guild.EVIDENCE_MAX}:${guild.id}`, total, "EX", 21600); // 6 hours

  return total;
}
