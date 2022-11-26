import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Booster } from "../../../types/Economy";
import Constants from "../../Constants";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getItems } from "./utils";
import _ = require("lodash");

export async function getBoosters(member: GuildMember | string): Promise<Map<string, Booster[]>> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const expired = new Map<string, number>();

  const cache = await redis.get(`${Constants.redis.cache.economy.BOOSTERS}:${id}`);

  if (cache) {
    if (_.isEmpty(JSON.parse(cache))) return new Map();

    const map = new Map<string, Booster[]>(Object.entries(JSON.parse(cache)));

    for (const key of map.keys()) {
      const boosters = map.get(key);

      for (const booster of boosters) {
        if (booster.expire <= Date.now()) {
          await prisma.booster.delete({
            where: {
              id: booster.id,
            },
          });

          if (expired.has(booster.boosterId)) {
            expired.set(booster.boosterId, expired.get(booster.boosterId) + 1);
          } else {
            expired.set(booster.boosterId, 1);
          }

          await redis.del(`${Constants.redis.cache.economy.BOOSTERS}:${id}`);

          boosters.splice(boosters.indexOf(booster), 1);

          if (boosters.length == 0) {
            map.delete(key);
          } else {
            map.set(key, boosters);
          }
        }
      }
    }

    if (expired.size != 0 && (await getDmSettings(id)).booster) {
      const embed = new CustomEmbed()
        .setColor(Constants.TRANSPARENT_EMBED_COLOR)
        .setFooter({ text: "/settings me notifications" });

      let desc = "";
      let text = "";
      let total = 0;
      const items = getItems();

      for (const expiredBoosterId of Array.from(expired.keys())) {
        total += expired.get(expiredBoosterId);

        if (expiredBoosterId == "steve") {
          const earned = parseInt((await redis.get(`${Constants.redis.nypsi.STEVE_EARNED}:${id}`)) || "0");
          await redis.del(`${Constants.redis.nypsi.STEVE_EARNED}:${id}`);

          desc += `\`${expired.get(expiredBoosterId)}x\` ${items[expiredBoosterId].emoji} ${
            items[expiredBoosterId].name
          } (earned $${earned.toLocaleString()})\n`;
        } else {
          desc += `\`${expired.get(expiredBoosterId)}x\` ${items[expiredBoosterId].emoji} ${items[expiredBoosterId].name}\n`;
        }
      }

      embed.setHeader(`expired booster${total > 1 ? "s" : ""}:`);
      embed.setDescription(desc);

      if (total == 1) {
        text = `your ${items[Array.from(expired.keys())[0]].name} ${
          items[Array.from(expired.keys())[0]].name.endsWith("booster") ? "" : "booster "
        }has expired`;
      } else {
        text = `${total} of your boosters have expired`;
      }

      if (member instanceof GuildMember) {
        await member.send({ embeds: [embed], content: text });
      } else {
        await addNotificationToQueue({
          memberId: id,
          payload: {
            content: text,
            embed: embed,
          },
        });
      }
    }

    return map;
  }

  const query = await prisma.booster.findMany({
    where: {
      userId: id,
    },
    select: {
      boosterId: true,
      expire: true,
      id: true,
    },
  });

  const map = new Map<string, Booster[]>();

  for (const booster of query) {
    if (booster.expire.getTime() <= Date.now()) {
      await prisma.booster.delete({
        where: {
          id: booster.id,
        },
      });

      if (expired.has(booster.boosterId)) {
        expired.set(booster.boosterId, expired.get(booster.boosterId) + 1);
      } else {
        expired.set(booster.boosterId, 1);
      }

      continue;
    }

    if (map.has(booster.boosterId)) {
      const c = map.get(booster.boosterId);

      c.push({
        boosterId: booster.boosterId,
        expire: booster.expire.getTime(),
        id: booster.id,
      });

      map.set(booster.boosterId, c);
    } else {
      map.set(booster.boosterId, [
        {
          boosterId: booster.boosterId,
          expire: booster.expire.getTime(),
          id: booster.id,
        },
      ]);
    }
  }

  if (expired.size != 0 && (await getDmSettings(id)).booster) {
    const embed = new CustomEmbed()
      .setColor(Constants.TRANSPARENT_EMBED_COLOR)
      .setFooter({ text: "/settings me notifications" });

    let desc = "";
    let text = "";
    let total = 0;
    const items = getItems();

    for (const expiredBoosterId of Array.from(expired.keys())) {
      total += expired.get(expiredBoosterId);

      if (expiredBoosterId == "steve") {
        const earned = parseInt((await redis.get(`${Constants.redis.nypsi.STEVE_EARNED}:${id}`)) || "0");
        await redis.del(`${Constants.redis.nypsi.STEVE_EARNED}:${id}`);

        desc += `\`${expired.get(expiredBoosterId)}x\` ${items[expiredBoosterId].emoji} ${
          items[expiredBoosterId].name
        } (earned $${earned.toLocaleString()})\n`;
      } else {
        desc += `\`${expired.get(expiredBoosterId)}x\` ${items[expiredBoosterId].emoji} ${items[expiredBoosterId].name}\n`;
      }
    }

    embed.setHeader(`expired booster${total > 1 ? "s" : ""}:`);
    embed.setDescription(desc);

    if (total == 1) {
      text = `your ${items[Array.from(expired.keys())[0]].name} ${
        items[Array.from(expired.keys())[0]].name.endsWith("booster") ? "" : "booster "
      }has expired`;
    } else {
      text = `${total} of your boosters have expired`;
    }

    if (member instanceof GuildMember) {
      await member.send({ embeds: [embed], content: text });
    } else {
      await addNotificationToQueue({
        memberId: id,
        payload: {
          embed: embed,
          content: text,
        },
      });
    }
  }

  await redis.set(`${Constants.redis.cache.economy.BOOSTERS}:${id}`, JSON.stringify(Object.fromEntries(map)));
  await redis.expire(`${Constants.redis.cache.economy.BOOSTERS}:${id}`, 300);

  return map;
}

export async function addBooster(member: GuildMember | string, boosterId: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const items = getItems();

  await prisma.booster.create({
    data: {
      boosterId: boosterId,
      expire: new Date(Date.now() + items[boosterId].boosterEffect.time * 1000),
      userId: id,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.BOOSTERS}:${id}`);
}
