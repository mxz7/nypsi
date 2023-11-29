import { Collection, Guild, GuildMember, Role } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { compareTwoStrings } from "string-similarity";
import Constants from "../Constants";
import chooseMember from "./workers/choosemember";

export async function getMember(guild: Guild, memberName: string): Promise<GuildMember> {
  if (!guild) return null;

  if (memberName.match(Constants.MENTION_REGEX)) {
    return (await guild.members.fetch(memberName.replaceAll(/\D/g, "")).catch(() => null)) || null;
  }

  if (memberName.match(Constants.SNOWFLAKE_REGEX)) {
    return await guild.members.fetch(memberName).catch(() => null);
  }

  let members: Collection<string, GuildMember>;

  if (guild.memberCount === guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  let target: GuildMember;
  const scores: { id: string; score: number }[] = [];
  memberName = memberName.toLowerCase();

  const before = performance.now();

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
      target = members.get(inPlaceSort(scores).desc((i) => i.score)[0]?.id);
    }
  }

  return target;
}

export async function getExactMember(guild: Guild, memberName: string): Promise<GuildMember> {
  if (!guild) return null;

  if (memberName.match(Constants.MENTION_REGEX)) {
    return (await guild.members.fetch(memberName.replaceAll(/\D/g, "")).catch(() => null)) || null;
  }

  if (memberName.match(Constants.SNOWFLAKE_REGEX)) {
    return await guild.members.fetch(memberName).catch(() => null);
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
