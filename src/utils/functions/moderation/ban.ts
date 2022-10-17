import { Guild, GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../models/Client";

export async function newBan(guild: Guild, userIDs: string[] | string, date: Date) {
  if (!(userIDs instanceof Array)) {
    userIDs = [userIDs];
  }

  for (const userID of userIDs) {
    await prisma.moderationBan.create({
      data: {
        userId: userID,
        expire: date,
        guildId: guild.id,
      },
    });
  }
}

export async function isBanned(guild: Guild, member: GuildMember) {
  const query = await prisma.moderationBan.findFirst({
    where: {
      AND: [{ guildId: guild.id }, { userId: member.user.id }],
    },
    select: {
      userId: true,
    },
  });

  if (query) {
    return true;
  } else {
    return false;
  }
}

export async function deleteBan(guild: Guild | string, member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.id;
  } else {
    id = member;
  }

  let guildId: string;
  if (guild instanceof Guild) {
    guildId = guild.id;
  } else {
    guildId = guild;
  }

  await prisma.moderationBan.deleteMany({
    where: {
      AND: [{ userId: id }, { guildId: guildId }],
    },
  });
}

export async function requestUnban(guildId: string, member: string, client: NypsiClient) {
  await client.cluster.broadcastEval(
    async (c, { guildId, memberId }) => {
      const guild = await c.guilds.fetch(guildId).catch(() => {});

      if (!guild) return "guild";

      let fail = false;
      await guild.members.unban(memberId, "ban expired").catch(() => {
        fail = true;
      });
      if (fail) return "unban";
      return true;
    },
    { context: { guildId: guildId, memberId: member } }
  );

  await deleteBan(guildId, member);
}
