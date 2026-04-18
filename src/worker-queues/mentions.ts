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
import { Mutex } from "../utils/functions/mutex";
import { encrypt } from "../utils/functions/string";
import { logger, setClusterId } from "../utils/logger";

setClusterId("worker-mentions");

const connection = new Redis({ maxRetriesPerRequest: null });
const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);

const worker = new Worker<MentionJobData>(
  "mentions",
  async (job) => {
    const { data } = job;

    let userIds: string[];

    const before = performance.now();

    if (data.mentions.some((m) => !m.startsWith("user:"))) {
      // there's roles or everyone, we need to fetch every user and handle permissions
      const members = await getAllMembers(data.guildId);

      const channelMembers = getMembersWithChannelAccess(members, data);

      let filteredMembers = channelMembers;

      if (data.mentions.some((m) => m.startsWith("role:"))) {
        const roleIds = data.mentions
          .filter((m) => m.startsWith("role:"))
          .map((m) => m.split(":")[1]);
        filteredMembers = filterRoles(channelMembers, roleIds);
      }

      userIds = filteredMembers.map((m) => m.userId);
    } else {
      userIds = data.mentions.map((m) => m.split(":")[1]);
    }

    logger.debug(`got filtered user ids in ${performance.now() - before}ms`, {
      guildId: data.guildId,
    });

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

worker.on("paused", () => {
  logger.info(`queue paused`);
});

worker.on("resumed", () => {
  logger.info(`queue resumed`);
});

worker.on("error", (err) => {
  logger.info(`queue error`, { name: err.name, message: err.message });
});

worker.on("stalled", (jobId) => {
  logger.info(`job stalled: ${jobId}`);
});

worker.on("failed", (job, err) => {
  logger.error(`job failed: ${job.id}`, {
    name: err.name,
    message: err.message,
    payload: job.data,
  });
});

type SlimMember = { userId: string; roles: string[] };

const membersCache = new MapCache<SlimMember[]>(ms("1 hour"));
const mutex = new Mutex();

async function getAllMembers(guildId: string): Promise<SlimMember[]> {
  const cache = membersCache.get(guildId);

  if (cache) {
    return cache;
  }

  await mutex.acquire(guildId);

  try {
    const allMembers: SlimMember[] = [];
    let after: string | undefined;

    while (true) {
      const query = new URLSearchParams({ limit: "1000" });
      if (after) query.set("after", after);

      const batch = (await rest.get(Routes.guildMembers(guildId), { query })) as APIGuildMember[];

      allMembers.push(...batch.map((m) => ({ userId: m.user!.id, roles: m.roles })));

      if (batch.length < 1000) break;

      after = batch.at(-1)!.user!.id;
    }

    membersCache.set(guildId, allMembers);

    const userIds = allMembers.map((m) => m.userId);

    // might as well update database
    void checkMembers(guildId, userIds, true).catch((error) => {
      logger.error("failed to update guild members in database", { guildId, error });
    });

    logger.debug(`fetched ${allMembers.length} members`, { guildId });

    return allMembers;
  } finally {
    mutex.release(guildId);
  }
}

// After BullMQ JSON serialisation, PermissionOverwrites allow/deny are plain strings
type SerializedOverwrite = { id: string; type: number; allow: string; deny: string };

function getMembersWithChannelAccess(members: SlimMember[], data: MentionJobData): SlimMember[] {
  const { roles: guildRoles, channelOverwrites, guildId } = data;

  const rolePermMap = new Map<string, bigint>();
  for (const role of guildRoles) {
    rolePermMap.set(role.id, BigInt(role.permissions));
  }

  const everyonePerms = rolePermMap.get(guildId) ?? 0n;
  const overwrites = (channelOverwrites ?? []) as unknown as SerializedOverwrite[];
  const overwriteMap = new Map<string, SerializedOverwrite>();
  for (const ow of overwrites) {
    overwriteMap.set(`${ow.type}:${ow.id}`, ow);
  }

  return members.filter((member) => {
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
    const everyoneOw = overwriteMap.get(`${OverwriteType.Role}:${guildId}`);
    if (everyoneOw) {
      perms &= ~BigInt(everyoneOw.deny);
      perms |= BigInt(everyoneOw.allow);
    }

    // b. Role overwrites — accumulate denies then allows across all member roles
    let roleDeny = 0n;
    let roleAllow = 0n;
    for (const roleId of member.roles) {
      const ow = overwriteMap.get(`${OverwriteType.Role}:${roleId}`);
      if (ow) {
        roleDeny |= BigInt(ow.deny);
        roleAllow |= BigInt(ow.allow);
      }
    }
    perms &= ~roleDeny;
    perms |= roleAllow;

    // c. Member-specific overwrite
    const memberOw = overwriteMap.get(`${OverwriteType.Member}:${member.userId}`);
    if (memberOw) {
      perms &= ~BigInt(memberOw.deny);
      perms |= BigInt(memberOw.allow);
    }

    return Boolean(perms & PermissionFlagsBits.ViewChannel);
  });
}

function filterRoles(members: SlimMember[], roles: string[]): SlimMember[] {
  return members.filter((member) => member.roles.some((role) => roles.includes(role)));
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

logger.info("online");
