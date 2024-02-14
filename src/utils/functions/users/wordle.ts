import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { addProgress } from "../economy/achievements";
import { addTaskProgress } from "../economy/tasks";

export async function getWordleStats(member: GuildMember) {
  const query = await prisma.wordleStats.findUnique({
    where: {
      userId: member.user.id,
    },
  });

  return query;
}

export async function addWordleGame(
  member: GuildMember,
  win: boolean,
  attempts?: number,
  seconds?: number,
) {
  const profile = await getWordleStats(member);

  if (!win) {
    if (profile) {
      await prisma.wordleStats.update({
        where: {
          userId: member.user.id,
        },
        data: {
          lose: { increment: 1 },
        },
      });
    } else {
      await prisma.wordleStats.create({
        data: {
          userId: member.user.id,
          lose: 1,
        },
      });
    }
  } else {
    if (profile) {
      profile.history.push(seconds);

      if (profile.history.length > 100) profile.history.shift();

      let data;

      switch (attempts) {
        case 0:
          data = {
            win1: { increment: 1 },
            history: profile.history,
          };
          break;
        case 1:
          data = {
            win2: { increment: 1 },
            history: profile.history,
          };
          break;
        case 2:
          data = {
            win3: { increment: 1 },
            history: profile.history,
          };
          break;
        case 3:
          data = {
            win4: { increment: 1 },
            history: profile.history,
          };
          break;
        case 4:
          data = {
            win5: { increment: 1 },
            history: profile.history,
          };
          break;
        case 5:
          data = {
            win6: { increment: 1 },
            history: profile.history,
          };
          break;
      }

      await prisma.wordleStats.update({
        where: {
          userId: member.user.id,
        },
        data: data,
      });
      addProgress(member.user.id, "wordle", 1);
      await addTaskProgress(member.user.id, "wordles_daily");
      await addTaskProgress(member.user.id, "wordles_weekly");
    } else {
      let data;

      switch (attempts) {
        case 0:
          data = {
            userId: member.user.id,
            win1: 1,
            history: [seconds],
          };
          break;
        case 1:
          data = {
            userId: member.user.id,
            win2: 1,
            history: [seconds],
          };
          break;
        case 2:
          data = {
            userId: member.user.id,
            win3: 1,
            history: [seconds],
          };
          break;
        case 3:
          data = {
            userId: member.user.id,
            win4: 1,
            history: [seconds],
          };
          break;
        case 4:
          data = {
            userId: member.user.id,
            win5: 1,
            history: [seconds],
          };
          break;
        case 5:
          data = {
            userId: member.user.id,
            win6: 1,
            history: [seconds],
          };
          break;
      }

      await prisma.wordleStats.create({
        data: data,
      });
      addProgress(member.user.id, "wordle", 1);
    }
  }
}
