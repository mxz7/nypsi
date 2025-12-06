import { BoosterScope } from "#generated/prisma";
import { GuildMember } from "discord.js";
import { sort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Booster } from "../../../types/Economy";
import { SteveData } from "../../../types/Workers";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";
import { pluralize } from "../string";
import { addNotificationToQueue, getDmSettings, getPreferences } from "../users/notifications";
import { getLastKnownUsername } from "../users/username";
import { getItems } from "./utils";
import _ = require("lodash");

const lastBoosterCheck = new Map<string, number>();

async function checkBoosters(member: MemberResolvable, boosters: Map<string, Booster[]>) {
  const userId = getUserId(member);

  if (lastBoosterCheck.has(userId)) {
    if (Date.now() - lastBoosterCheck.get(userId) < 500) {
      return boosters;
    }
  }

  lastBoosterCheck.set(userId, Date.now());

  if (
    (await redis.exists("nypsi:maintenance")) ||
    (await redis.exists(`${Constants.redis.nypsi.RESTART}:1`))
  ) {
    return boosters;
  }

  const expired = new Map<string, number>();
  const now = Date.now();

  for (const key of boosters.keys()) {
    const boosters2 = boosters.get(key);
    const newBoosters: Booster[] = [];

    for (const booster of boosters2) {
      if (booster.expire <= now) {
        await prisma.booster
          .delete({
            where: {
              id: booster.id,
            },
          })
          .catch(() => {});

        if (booster.scope === "global" && (await getDmSettings(booster.userId)).booster) {
          addNotificationToQueue({
            memberId: booster.userId,
            payload: {
              embed: new CustomEmbed(
                booster.userId,
                `your ${getItems()[booster.boosterId].emoji} **${getItems()[booster.boosterId].name}** global booster has expired`,
              ),
            },
          });
        }

        if (expired.has(booster.boosterId)) {
          expired.set(booster.boosterId, expired.get(booster.boosterId) + 1);
        } else {
          expired.set(booster.boosterId, 1);
        }
      } else {
        newBoosters.push(booster);
      }
    }

    if (newBoosters.length > 0) {
      boosters.set(key, newBoosters);
    } else {
      boosters.delete(key);
    }
  }

  if (expired.size != 0) {
    await redis.del(`${Constants.redis.cache.economy.BOOSTERS}:${userId}`);

    if ((await getDmSettings(userId)).booster) {
      const embed = new CustomEmbed(userId).setFooter({ text: "/settings me notifications" });

      let desc = "";
      let text = "";
      let total = 0;
      const items = getItems();

      for (const expiredBoosterId of Array.from(expired.keys())) {
        total += expired.get(expiredBoosterId);

        if (expiredBoosterId == "steve") {
          let earned: SteveData = JSON.parse(
            await redis.get(`${Constants.redis.nypsi.STEVE_EARNED}:${userId}`),
          );

          if (!earned) earned = { money: 0, byproducts: {} };

          desc += `\`${expired.get(expiredBoosterId)}x\` ${items[expiredBoosterId].emoji} ${
            items[expiredBoosterId].name
          } (earned $${earned.money.toLocaleString()})\n`;

          const descOther: string[] = [];

          for (const byproduct in earned.byproducts) {
            if (earned.byproducts[byproduct] > 0) {
              descOther.push(
                `steve found **${earned.byproducts[byproduct]}x** ${getItems()[byproduct].emoji} ${
                  getItems()[byproduct].name
                }`,
              );
            }
          }

          if (descOther.length > 0) desc += `\n${descOther.join("\n")}\n\n`;
        } else {
          desc += `\`${expired.get(expiredBoosterId)}x\` ${items[expiredBoosterId].emoji} ${
            items[expiredBoosterId].name
          }\n`;
        }
      }

      embed.setHeader(`expired ${pluralize("booster", total)}:`);
      embed.setDescription(desc);

      if (total == 1) {
        text = `your ${items[Array.from(expired.keys())[0]].name} ${
          items[Array.from(expired.keys())[0]].name.endsWith("booster") ? "" : "booster "
        }has expired`;
      } else {
        text = `${total} of your boosters have expired`;
      }

      if (member instanceof GuildMember) {
        member.send({ embeds: [embed], content: text });
      } else {
        addNotificationToQueue({
          memberId: userId,
          payload: {
            content: text,
            embed: embed,
          },
        });
      }
    }

    if (expired.has("steve")) await redis.del(`${Constants.redis.nypsi.STEVE_EARNED}:${userId}`);
  }

  return boosters;
}

export async function getBoosters(member: MemberResolvable): Promise<Map<string, Booster[]>> {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.BOOSTERS}:${userId}`);

  if (cache) {
    if (_.isEmpty(JSON.parse(cache))) return new Map();

    const map = new Map<string, Booster[]>(Object.entries(JSON.parse(cache)));

    return await checkBoosters(member, map);
  }

  const query = await prisma.booster.findMany({
    where: {
      OR: [{ scope: "global" }, { userId }],
    },
  });

  let map = new Map<string, Booster[]>();

  query.forEach((i) => {
    if (map.has(i.boosterId)) {
      map.get(i.boosterId).push({
        boosterId: i.boosterId,
        expire: i.expire.getTime(),
        id: i.id,
        scope: i.scope,
        userId: i.userId,
      });
    } else {
      map.set(i.boosterId, [
        {
          boosterId: i.boosterId,
          expire: i.expire.getTime(),
          id: i.id,
          scope: i.scope,
          userId: i.userId,
        },
      ]);
    }
  });

  map = await checkBoosters(member, map);

  await redis.set(
    `${Constants.redis.cache.economy.BOOSTERS}:${userId}`,
    JSON.stringify(Object.fromEntries(map)),
    "EX",
    300,
  );

  return map;
}

export async function addBooster(
  member: MemberResolvable,
  boosterId: string,
  amount = 1,
  expire?: Date,
  scope: BoosterScope = "user",
) {
  const userId = getUserId(member);
  const items = getItems();

  await prisma.booster.createMany({
    data: new Array(amount).fill({
      boosterId: boosterId,
      expire: expire || new Date(Date.now() + items[boosterId].boosterEffect.time * 1000),
      userId,
      scope,
    }),
  });

  await redis.del(`${Constants.redis.cache.economy.BOOSTERS}:${userId}`);
}

export async function getBoostersDisplay(
  boosters: Map<string, Booster[]>,
  embed: CustomEmbed,
): Promise<null | Map<number, string[]>> {
  const desc: string[] = [];

  const items = getItems();

  if (boosters.size == 0) {
    return null;
  }

  const globalBoosters: string[] = [];

  for (const boosterId of sort(Array.from(boosters.keys())).asc((i) => i)) {
    if (boosters.get(boosterId)[0].scope === "global") {
      const count = boosters.get(boosterId).length;
      const ownerId = boosters.get(boosterId)[0].userId;
      let username: string;

      if ((await getPreferences(ownerId)).leaderboards) {
        username = await getLastKnownUsername(ownerId);
      }

      if (count === 1) {
        globalBoosters.push(
          `${items[boosterId].emoji} **${items[boosterId].name}** - expires <t:${Math.round(
            boosters.get(boosterId)[0].expire / 1000,
          )}:R>${username ? `, by **[${username}](https://nypsi.xyz/users/${ownerId}?ref=bot-global-booster)**` : ""}`,
        );
      } else {
        globalBoosters.push(
          `${items[boosterId].emoji} **${items[boosterId].name}** \`x${count}\` - next expires <t:${Math.round(
            boosters.get(boosterId)[0].expire / 1000,
          )}:R>${username ? `, by **[${username}](https://nypsi.xyz/users/${ownerId}?ref=bot-global-booster)**` : ""}`,
        );
      }
    } else {
      if (boosters.get(boosterId).length == 1) {
        desc.push(
          `${items[boosterId].emoji} **${items[boosterId].name}** - expires <t:${Math.round(
            boosters.get(boosterId)[0].expire / 1000,
          )}:R>`,
        );
      } else {
        let lowest = boosters.get(boosterId)[0].expire;

        for (const booster of boosters.get(boosterId)) {
          if (booster.expire < lowest) lowest = booster.expire;
        }

        desc.push(
          `${items[boosterId].emoji} **${items[boosterId].name}** \`x${
            boosters.get(boosterId).length
          }\` - next expires <t:${Math.round(boosters.get(boosterId)[0].expire / 1000)}:R>`,
        );
      }
    }
  }

  const pages = PageManager.createPages(desc, 10);
  const firstPage = pages.get(1);

  if (firstPage) {
    embed.setDescription(firstPage.join("\n"));
  }

  if (globalBoosters.length > 0) {
    embed.addFields({
      name: "global boosters",
      value: globalBoosters.join("\n"),
    });
  }

  return pages;
}
