import {
  APIInteractionGuildMember,
  Guild,
  GuildMember,
  PartialGuildMember,
  PartialUser,
  Role,
  User,
} from "discord.js";
import { inPlaceSort, sort } from "fast-sort";
import { compareTwoStrings } from "string-similarity";
import { NypsiClient } from "../../models/Client";
import Constants from "../Constants";
import { logger } from "../logger";
import {
  getAllMembers,
  getAllMembersRest,
  SlimMember,
  transformGuildMemberToSlim,
} from "./guilds/members";
import chooseMember from "./workers/choosemember";
import ms = require("ms");

const memberCache = new Map<string, Map<string, { userId: string; expire: number }>>();

export function clearMemberCache(guildId?: string) {
  if (guildId) memberCache.delete(guildId);
  else memberCache.clear();
}

setInterval(() => {
  let count = 0;

  for (const [guildId, map] of memberCache.entries()) {
    for (const [search, user] of map.entries()) {
      if (user.expire < Date.now()) {
        count++;
        map.delete(search);
      }
    }

    if (map.size === 0) memberCache.delete(guildId);
  }

  if (count > 0) {
    const guildSize = memberCache.size;
    const membersSize = Array.from(memberCache.values()).map((i) => i.size);

    logger.debug(`${count.toLocaleString()} member find cache entries deleted`, {
      guilds: guildSize,
      members: membersSize.length > 0 ? membersSize.reduce((a, b) => a + b) : 0,
    });
  }
}, ms("30 minutes"));

export async function getMember(
  guild: Guild,
  memberName: string,
  debug: true,
): Promise<{ username: string; score: number }[]>;
export async function getMember(guild: Guild, memberName: string): Promise<GuildMember>;
export async function getMember(
  guild: Guild,
  memberName: string,
  debug?: true,
): Promise<GuildMember | { username: string; score: number }[]> {
  if (!guild) return null;

  const fetchMember = (userId: string) => {
    if (!userId) return null;
    return guild.members.fetch(userId).catch(() => {});
  };

  memberName = memberName.toLowerCase();

  const cacheHit = memberCache.get(guild.id)?.get(memberName);

  if (cacheHit && !debug) {
    if (cacheHit.expire < Date.now()) {
      memberCache.get(guild.id).delete(memberName);
    } else {
      return (await fetchMember(cacheHit.userId)) || null;
    }
  }

  if (memberName.match(Constants.MEMBER_MENTION_REGEX)) {
    return (await fetchMember(memberName.replaceAll(/\D/g, "")).catch(() => {})) || null;
  }

  if (memberName.match(Constants.SNOWFLAKE_REGEX)) {
    return (await fetchMember(memberName).catch(() => {})) || null;
  }

  let members: SlimMember[];

  if (guild.memberCount === guild.members.cache.size) {
    members = guild.members.cache.map(transformGuildMemberToSlim);
  } else {
    if (guild.memberCount > 1000) {
      members = await getAllMembersRest(guild.id, guild.client as NypsiClient);
    } else {
      members = await getAllMembers(guild).then((c) => c.map(transformGuildMemberToSlim));
    }
  }

  let targetId: string;
  const scores: { id: string; score: number }[] = [];

  if (memberName === "max" && !debug) {
    const max = members.find((m) => m.userId === Constants.OWNER_ID);
    if (max) {
      return (await fetchMember(max.userId).catch(() => {})) || null;
    }
  }

  if (members.length > 2000) {
    targetId = await chooseMember(members, memberName);
  } else {
    for (const member of members) {
      if (member.userId === memberName) {
        targetId = member.userId;
        break;
      } else if (member.username.toLowerCase() === memberName) {
        targetId = member.userId;
        break;
      } else {
        let score = 0;

        if (member.username.toLowerCase().startsWith(memberName)) score += 1.5;
        if (member.displayName.toLowerCase().startsWith(memberName)) score += 1.1;
        if (member.nickname?.toLowerCase().startsWith(memberName)) score += 0.5;

        if (member.username.toLowerCase().includes(memberName)) score += 0.75;
        if (member.displayName.toLowerCase().includes(memberName)) score += 0.5;
        if (member.nickname?.toLowerCase().includes(memberName)) score += 0.25;

        const usernameComparison = compareTwoStrings(member.username.toLowerCase(), memberName);
        const displayNameComparison = compareTwoStrings(
          member.displayName.toLowerCase(),
          memberName,
        );
        const guildNameComparison = compareTwoStrings(
          member.nickname?.toLowerCase() || "",
          memberName,
        );

        score += usernameComparison * 2.5;
        score += displayNameComparison === 1 ? 1.5 : displayNameComparison;
        score += guildNameComparison === 1 ? 1.2 : displayNameComparison;

        // remember to change on worker
        // higher = require more accurate typing
        if (score > 2) scores.push({ id: member.userId, score });
      }
    }

    if (!targetId && scores.length > 0) {
      if (debug) {
        return sort(scores)
          .desc((i) => i.score)
          .map((i) => ({
            score: i.score,
            username: members.find((m) => m.userId === i.id)?.username,
          }));
      }
      targetId = members.find(
        (m) => m.userId === inPlaceSort(scores).desc((i) => i.score)[0]?.id,
      )?.userId;
    }
  }

  if (targetId) {
    if (memberCache.get(guild.id)) {
      memberCache
        .get(guild.id)
        .set(memberName, { userId: targetId, expire: Date.now() + ms("15 minutes") });
    } else {
      memberCache.set(
        guild.id,
        new Map([[memberName, { userId: targetId, expire: Date.now() + ms("15 minutes") }]]),
      );
    }
  }

  if (debug) {
    return [
      ...(targetId
        ? [{ username: members.find((m) => m.userId === targetId)?.username, score: 10000 }]
        : []),
      ...sort(scores)
        .desc((i) => i.score)
        .map((i) => ({
          score: i.score,
          username: members.find((m) => m.userId === i.id)?.username,
        })),
    ];
  }

  return (await fetchMember(targetId).catch(() => {})) || null;
}

export async function getExactMember(guild: Guild, memberName: string): Promise<GuildMember> {
  if (!guild) return null;

  if (memberName.match(Constants.MEMBER_MENTION_REGEX)) {
    return (await guild.members.fetch(memberName.replaceAll(/\D/g, "")).catch(() => {})) || null;
  }

  if (memberName.match(Constants.SNOWFLAKE_REGEX)) {
    return (await guild.members.fetch(memberName).catch(() => {})) || null;
  }

  let members: SlimMember[];

  if (guild.memberCount === guild.members.cache.size) {
    members = guild.members.cache.map(transformGuildMemberToSlim);
  } else if (guild.memberCount > 1000) {
    members = await getAllMembersRest(guild.id, guild.client as NypsiClient);
  } else {
    members = await getAllMembers(guild).then((c) => c.map(transformGuildMemberToSlim));
  }

  const member = members.find(
    (member) =>
      member.username.toLowerCase() == memberName.toLowerCase() ||
      member.userId == memberName ||
      member.displayName.toLowerCase() == memberName.toLowerCase(),
  );

  if (!member) {
    return null;
  }

  return (await guild.members.fetch(member.userId).catch(() => {})) || null;
}

export async function getRole(guild: Guild, roleName: string): Promise<Role> {
  if (!guild) return null;

  let target: Role;
  const possible = new Map<number, Role>();

  for (const role of guild.roles.cache.values()) {
    if (role.id == roleName) {
      target = role;
      break;
    } else if (role.name.toLowerCase() == roleName.toLowerCase()) {
      target = role;
      break;
    } else if (role.name.toLowerCase().includes(roleName.toLowerCase())) {
      possible.set(3, role);
    }
  }

  if (!target) {
    if (possible.get(1)) {
      target = possible.get(1);
    } else if (possible.get(2)) {
      target = possible.get(2);
    } else if (possible.get(3)) {
      target = possible.get(3);
    } else if (possible.get(4)) {
      target = possible.get(4);
    } else if (possible.get(5)) {
      target = possible.get(5);
    } else if (possible.get(6)) {
      target = possible.get(6);
    } else {
      target = null;
    }
  }

  return target;
}

export type MemberResolvable =
  | GuildMember
  | PartialGuildMember
  | APIInteractionGuildMember
  | User
  | PartialUser
  | string;

export function getUserId(user: MemberResolvable): string {
  try {
    if (typeof user === "string") return user;
    if (typeof (user as any).id === "string") return (user as any).id;
    return (user as APIInteractionGuildMember).user.id;
  } catch (err) {
    if (user) {
      logger.error("failed to fetch user id", { user });
      console.error(err);
    }
    return undefined;
  }
}
