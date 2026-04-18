import { REST } from "@discordjs/rest";
import { Worker } from "bullmq";
import { APIGuildMember, OverwriteType, PermissionFlagsBits, Routes } from "discord-api-types/v10";
import Redis from "ioredis";
import "dotenv/config";
import ms from "ms";
import { Prisma } from "#generated/prisma";
import prisma from "../init/database";
import { MentionJobData } from "../types/workers/mentions";
import { MapCache } from "../utils/cache";
import { checkMembers } from "../utils/functions/guilds/members";
import { encrypt } from "../utils/functions/string";
import { applyLogs } from "../utils/functions/workers/helpers";
import { setClusterId } from "../utils/logger";

setClusterId("worker-mentions");

const connection = new Redis({ maxRetriesPerRequest: null });
const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);

const worker = new Worker<MentionJobData>(
  "mentions",
  async (job) => {
    const { data } = job;

    let userIds: string[];

    if (data.mentions.some((m) => !m.startsWith("user:"))) {
      // there's roles or everyone, we need to fetch every user and handle permissiolns
      const members = await getAllMembers(data.guildId);

      userIds = getMembersWithChannelAccess(members, data);
    } else {
      userIds = data.mentions.map((m) => m.split(":")[1]);
    }

    await createMentions({
      guildId: data.guildId,
      messageUrl: data.messageUrl,
      content: data.content,
      username: data.username,
      userIds,
      date: new Date(data.date),
    });
  },
  {
    connection,
    concurrency: 1,
  },
);

applyLogs(worker, "mentions");

// prevent duplicate message ids from being handled
const handled = new Map<string, number>();

setInterval(() => {
  for (const [messageId, timestamp] of handled.entries()) {
    if (Date.now() - timestamp > ms("1 hour")) {
      handled.delete(messageId);
    }
  }
}, ms("1 hour"));

worker.on("completed", (job) => {
  handled.set(job.data.messageId, Date.now());
});

const membersCache = new MapCache<APIGuildMember[]>(ms("1 hour"));

async function getAllMembers(guildId: string) {
  const cache = membersCache.get(guildId);

  if (cache) {
    return cache;
  }

  const members = (await rest.get(Routes.guildMembers(guildId))) as APIGuildMember[];

  membersCache.set(guildId, members);

  const userIds = members.map((m) => m.user.id);

  // might as well update database
  checkMembers(guildId, userIds, true);

  return members;
}

// After BullMQ JSON serialisation, PermissionOverwrites allow/deny are plain strings
type SerializedOverwrite = { id: string; type: number; allow: string; deny: string };

function getMembersWithChannelAccess(members: APIGuildMember[], data: MentionJobData): string[] {
  const { roles: guildRoles, channelOverwrites, guildId } = data;

  const rolePermMap = new Map<string, bigint>();
  for (const role of guildRoles) {
    rolePermMap.set(role.id, BigInt(role.permissions));
  }

  const everyonePerms = rolePermMap.get(guildId) ?? 0n;
  const overwrites = (channelOverwrites ?? []) as unknown as SerializedOverwrite[];

  return members
    .filter((member) => {
      if (!member.user) return false;

      // 1. Base: @everyone role permissions
      let perms = everyonePerms;

      // 2. OR in all of the member's role permissions
      for (const roleId of member.roles) {
        perms |= rolePermMap.get(roleId) ?? 0n;
      }

      // 3. Administrators bypass all channel permission checks
      if (perms & PermissionFlagsBits.Administrator) return true;

      // 4. Apply channel overwrites in Discord's defined order
      // a. @everyone overwrite
      const everyoneOw = overwrites.find(
        (ow) => ow.id === guildId && ow.type === OverwriteType.Role,
      );
      if (everyoneOw) {
        perms &= ~BigInt(everyoneOw.deny);
        perms |= BigInt(everyoneOw.allow);
      }

      // b. Role overwrites — accumulate denies then allows across all member roles
      let roleDeny = 0n;
      let roleAllow = 0n;
      for (const roleId of member.roles) {
        const ow = overwrites.find((o) => o.id === roleId && o.type === OverwriteType.Role);
        if (ow) {
          roleDeny |= BigInt(ow.deny);
          roleAllow |= BigInt(ow.allow);
        }
      }
      perms &= ~roleDeny;
      perms |= roleAllow;

      // c. Member-specific overwrite
      const memberOw = overwrites.find(
        (ow) => ow.id === member.user!.id && ow.type === OverwriteType.Member,
      );
      if (memberOw) {
        perms &= ~BigInt(memberOw.deny);
        perms |= BigInt(memberOw.allow);
      }

      return Boolean(perms & PermissionFlagsBits.ViewChannel);
    })
    .map((m) => m.user!.id);
}

async function createMentions(data: {
  guildId: string;
  messageUrl: string;
  content: string;
  username: string;
  userIds: string[];
  date: Date;
}) {
  const { guildId, messageUrl, content: rawContent, username, userIds, date } = data;

  const content = encrypt(rawContent.replace(/(\r\n|\n|\r)/gm, " "));

  const insertData: Prisma.MentionCreateManyArgs["data"] = [];

  for (const userId of userIds) {
    insertData.push({
      guildId,
      targetId: userId,
      content,
      url: messageUrl,
      userTag: username,
      date,
    });

    if (insertData.length >= 1000) {
      await prisma.mention.createMany({ data: insertData });
      insertData.length = 0;
    }
  }

  if (insertData.length > 0) {
    await prisma.mention.createMany({ data: insertData });
  }
}
