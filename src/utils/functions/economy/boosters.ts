import { exec } from "node:child_process";
import { GuildMember } from "discord.js";
import { sort } from "fast-sort";
import ms from "ms";
import { BoosterScope, Prisma } from "#generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Booster, JeremyData } from "../../../types/Economy";
import { SteveData } from "../../../types/Workers";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";
import { pluralize } from "../string";
import { addNotificationToQueue } from "../users/notifications";
import { getPreferences } from "../users/preferences";
import { getLastKnownUsername } from "../users/username";
import { addInventoryItem, addItemSourceStat } from "./inventory";
import { getItems } from "./utils";

const lastBoosterCheck = new Map<string, number>();
const boostersCache = new RedisCache<Record<string, Booster[]>>(
  Constants.redis.cache.economy.BOOSTERS,
  300,
);

function getGlobalBoosterProgressKey(booster: Booster) {
  return `${Constants.redis.nypsi.GLOBAL_BOOSTER_PROGRESS}:${booster.id}`;
}

export async function trackGlobalBoosterUse(booster: Booster, member: MemberResolvable) {
  if (booster.scope !== "global" || booster.userId === getUserId(member)) return;

  await redis.incr(getGlobalBoosterProgressKey(booster));
}

setInterval(() => {
  for (const [key, value] of lastBoosterCheck.entries()) {
    if (Date.now() - value > 500) {
      lastBoosterCheck.delete(key);
    }
  }
}, ms("10 minutes"));

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
        const deleted = await prisma.booster.deleteMany({ where: { id: booster.id } });

        if (deleted.count === 0) continue;

        if (booster.scope === "global") {
          const item = getItems()[booster.boosterId];
          const uses = parseInt((await redis.getdel(getGlobalBoosterProgressKey(booster))) ?? "0");
          const reward = Math.floor(uses / item.boosterEffect.usesPerDabloon);

          if (reward > 0) {
            await addInventoryItem(booster.userId, "dabloon", reward);
            addItemSourceStat("dabloon", `global_booster:${booster.boosterId}`, reward);
          }

          if ((await getPreferences(booster.userId)).dms.booster) {
            const rewardText =
              reward > 0
                ? `\n\n**${uses.toLocaleString()}** uses earned you **${reward.toLocaleString()}** ${getItems().dabloon.emoji} ${pluralize("dabloon", reward)}`
                : "";

            addNotificationToQueue({
              memberId: booster.userId,
              payload: {
                embed: new CustomEmbed(
                  booster.userId,
                  `your ${item.emoji} **${item.name}** global booster has expired${rewardText}`,
                ),
              },
            });
          }

          continue;
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
    await boostersCache.delete(userId);

    if ((await getPreferences(userId)).dms.booster) {
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
        } else if (expiredBoosterId === "jeremy") {
          let earned: JeremyData = JSON.parse(
            await redis.get(`${Constants.redis.nypsi.JEREMY_EARNED}:${userId}`),
          );

          if (!earned) earned = { harvested: {} };

          desc += `\`${expired.get(expiredBoosterId)}x\` ${items[expiredBoosterId].emoji} ${
            items[expiredBoosterId].name
          }\n`;

          const harvested = Object.entries(earned.harvested)
            .filter(([, amount]) => amount > 0)
            .map(
              ([itemId, amount]) =>
                `jeremy harvested **${amount.toLocaleString()}x** ${items[itemId].emoji} ${items[itemId].name}`,
            );

          if (harvested.length > 0) desc += `\n${harvested.join("\n")}\n\n`;
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
    if (expired.has("jeremy")) await redis.del(`${Constants.redis.nypsi.JEREMY_EARNED}:${userId}`);
  }

  return boosters;
}

export async function getBoosters(member: MemberResolvable): Promise<Map<string, Booster[]>> {
  const userId = getUserId(member);

  const cache = await boostersCache.get(userId);

  if (cache) {
    if (Object.keys(cache).length === 0) return new Map();

    const map = new Map<string, Booster[]>(Object.entries(cache));

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

  await boostersCache.set(userId, Object.fromEntries(map));

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
    data: Array.from({ length: amount }).fill({
      boosterId: boosterId,
      expire: expire || new Date(Date.now() + items[boosterId].boosterEffect.time * 1000),
      userId,
      scope,
    }) as Prisma.BoosterCreateManyInput[],
  });

  await boostersCache.delete(userId);

  if (scope === "global") {
    exec(`redis-cli KEYS "*cache:economy:boosters*" | xargs redis-cli DEL`);
  }
}

export async function getBoostersDisplay(
  boosters: Map<string, Booster[]>,
  embed: CustomEmbed,
  useDescription = false,
): Promise<null | Map<number, string[]>> {
  const desc: string[] = [];

  const items = getItems();

  if (boosters.size == 0) {
    return null;
  }

  const globalBoosters: string[] = [];

  for (const boosterId of sort(Array.from(boosters.keys())).asc((i) => i)) {
    const boosterName = items[boosterId].booster_name ?? items[boosterId].name;

    if (boosters.get(boosterId)[0].scope === "global") {
      const count = boosters.get(boosterId).length;
      const ownerId = boosters.get(boosterId)[0].userId;
      let username: string;

      if (!(await getPreferences(ownerId)).leaderboards) {
        username = await getLastKnownUsername(ownerId, false);
      }

      if (count === 1) {
        globalBoosters.push(
          `${items[boosterId].emoji} **${boosterName}** - expires <t:${Math.round(
            boosters.get(boosterId)[0].expire / 1000,
          )}:R>${username ? `, by [**${username}**](https://nypsi.xyz/users/${ownerId}?ref=bot-global-booster)` : ""}`,
        );
      } else {
        globalBoosters.push(
          `${items[boosterId].emoji} **${boosterName}** \`x${count}\` - next expires <t:${Math.round(
            boosters.get(boosterId)[0].expire / 1000,
          )}:R>${username ? `, by [**${username}**](https://nypsi.xyz/users/${ownerId}?ref=bot-global-booster)` : ""}`,
        );
      }
    } else {
      if (boosters.get(boosterId).length == 1) {
        desc.push(
          `${items[boosterId].emoji} **${boosterName}** - expires <t:${Math.round(
            boosters.get(boosterId)[0].expire / 1000,
          )}:R>`,
        );
      } else {
        let lowest = boosters.get(boosterId)[0].expire;

        for (const booster of boosters.get(boosterId)) {
          if (booster.expire < lowest) lowest = booster.expire;
        }

        desc.push(
          `${items[boosterId].emoji} **${boosterName}** \`x${
            boosters.get(boosterId).length
          }\` - next expires <t:${Math.round(boosters.get(boosterId)[0].expire / 1000)}:R>`,
        );
      }
    }
  }

  const pages = PageManager.createPages(desc, 10);
  const firstPage = pages.get(1);

  if (firstPage) {
    if (useDescription) {
      embed.setDescription(firstPage.join("\n"));
    } else {
      embed.addField("current boosters", firstPage.join("\n"));
    }
  }

  if (globalBoosters.length > 0) {
    embed.addFields({
      name: "global boosters",
      value: globalBoosters.join("\n"),
    });
  }

  return pages;
}
