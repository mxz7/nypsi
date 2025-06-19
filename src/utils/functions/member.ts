import { APIInteractionGuildMember, Collection, Guild, GuildMember, Role, User } from "discord.js";
import { inPlaceSort, sort } from "fast-sort";
import { compareTwoStrings } from "string-similarity";
import Constants from "../Constants";
import { logger } from "../logger";
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

  if (memberName.match(Constants.MEMBER_MENTION_REGEX)) {
    return (await guild.members.fetch(memberName.replaceAll(/\D/g, "")).catch(() => {})) || null;
  }

  if (memberName.match(Constants.SNOWFLAKE_REGEX)) {
    return (await guild.members.fetch(memberName).catch(() => {})) || null;
  }

  let members: Collection<string, GuildMember>;

  if (guild.memberCount === guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  memberName = memberName.toLowerCase();

  const cacheHit = memberCache.get(guild.id)?.get(memberName);

  if (cacheHit && !debug) {
    if (cacheHit.expire < Date.now()) memberCache.get(guild.id).delete(memberName);
    return members.get(cacheHit.userId);
  }

  let target: GuildMember;
  const scores: { id: string; score: number }[] = [];

  if (memberName === "max" && members.get(Constants.TEKOH_ID) && !debug)
    return members.get(Constants.TEKOH_ID);

  if (members.size > 2000) {
    const id = await chooseMember(members, memberName);
    target = members.get(id);
  } else {
    for (const m of members.keys()) {
      const member = members.get(m);

      if (member.user.id === memberName) {
        target = member;
        break;
      } else if (member.user.username.toLowerCase() === memberName) {
        target = member;
        break;
      } else {
        let score = 0;

        if (member.user.username.toLowerCase().startsWith(memberName)) score += 1.25;
        if (member.user.displayName.toLowerCase().startsWith(memberName)) score += 1;
        if (member.displayName.toLowerCase().startsWith(memberName)) score += 0.5;

        if (member.user.username.toLowerCase().includes(memberName)) score += 0.75;
        if (member.user.displayName.toLowerCase().includes(memberName)) score += 0.5;
        if (member.displayName.toLowerCase().includes(memberName)) score += 0.25;

        const usernameComparison = compareTwoStrings(
          member.user.username.toLowerCase(),
          memberName,
        );
        const displayNameComparison = compareTwoStrings(
          member.user.displayName.toLowerCase(),
          memberName,
        );
        const guildNameComparison = compareTwoStrings(member.displayName.toLowerCase(), memberName);

        score += usernameComparison * 2.5;
        score += displayNameComparison === 1 ? 1.5 : displayNameComparison;
        score += guildNameComparison === 1 ? 1.2 : displayNameComparison;

        // remember to change on worker
        // higher = require more accurate typing
        if (score > 2) scores.push({ id: member.id, score });
      }
    }

    if (!target && scores.length > 0) {
      if (debug) {
        return sort(scores)
          .desc((i) => i.score)
          .map((i) => ({ score: i.score, username: members.get(i.id).user.username }));
      }
      target = members.get(inPlaceSort(scores).desc((i) => i.score)[0]?.id);
    }
  }

  if (target?.id) {
    if (memberCache.get(guild.id)) {
      memberCache
        .get(guild.id)
        .set(memberName, { userId: target.id, expire: Date.now() + ms("15 minutes") });
    } else {
      memberCache.set(
        guild.id,
        new Map([[memberName, { userId: target.id, expire: Date.now() + ms("15 minutes") }]]),
      );
    }
  }

  if (debug) {
    return [
      { username: target.user.username, score: 10000 },
      ...sort(scores)
        .desc((i) => i.score)
        .map((i) => ({ score: i.score, username: members.get(i.id).user.username })),
    ];
  }

  return target;
}

export async function getExactMember(guild: Guild, memberName: string): Promise<GuildMember> {
  if (!guild) return null;

  if (memberName.match(Constants.MEMBER_MENTION_REGEX)) {
    return (await guild.members.fetch(memberName.replaceAll(/\D/g, "")).catch(() => {})) || null;
  }

  if (memberName.match(Constants.SNOWFLAKE_REGEX)) {
    return (await guild.members.fetch(memberName).catch(() => {})) || null;
  }

  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size && guild.memberCount <= 25) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  const target = members.find(
    (member) =>
      member.user.username.toLowerCase() == memberName.toLowerCase() ||
      member.user.id == memberName ||
      member.user.displayName.toLowerCase() == memberName.toLowerCase(),
  );

  return target;
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

export type MemberResolvable = GuildMember | APIInteractionGuildMember | User | string;

export function getUserId(user: MemberResolvable): string {
  if (typeof user === "string") return user;
  if (typeof (user as any).id === "string") return (user as any).id;
  return (user as APIInteractionGuildMember).user.id;
}
