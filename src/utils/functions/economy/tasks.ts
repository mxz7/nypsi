import { Task as PrismaTask } from "@prisma/client";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import { Task } from "../../../types/Tasks";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addKarma } from "../karma/karma";
import sleep from "../sleep";
import { addInlineNotification } from "../users/notifications";
import { getLastKnownAvatar } from "../users/tag";
import { getBalance, updateBalance } from "./balance";
import { addInventoryItem } from "./inventory";
import { getItems, getTasksData, userExists } from "./utils";
import { getXp, updateXp } from "./xp";

const taskGeneration = new Set<string>();

async function generateDailyTasks(userId: string) {
  await prisma.task.deleteMany({ where: { AND: [{ user_id: userId }, { type: "daily" }] } });
  await redis.del(`${Constants.redis.cache.economy.TASKS}:${userId}`);

  const tasks = Object.values(getTasksData()).filter((i) => i.type === "daily");

  const usersTasks: Task[] = [];

  for (let i = 0; i < 3; i++) {
    const chosen = tasks[Math.floor(Math.random() * tasks.length)];

    usersTasks.push(chosen);

    tasks.splice(
      tasks.findIndex((t) => t.id === chosen.id),
      1,
    );
  }

  await prisma.task.createMany({
    data: usersTasks.map((task) => {
      return {
        task_id: task.id,
        prize: task.prizes[Math.floor(Math.random() * task.prizes.length)],
        user_id: userId,
        target: task.target[Math.floor(Math.random() * task.target.length)],
        type: task.type,
      };
    }),
  });
}

async function generateWeeklyTasks(userId: string) {
  await prisma.task.deleteMany({ where: { AND: [{ user_id: userId }, { type: "weekly" }] } });
  await redis.del(`${Constants.redis.cache.economy.TASKS}:${userId}`);

  const tasks = Object.values(getTasksData()).filter((i) => i.type === "weekly");

  const usersTasks: Task[] = [];

  for (let i = 0; i < 3; i++) {
    const chosen = tasks[Math.floor(Math.random() * tasks.length)];

    usersTasks.push(chosen);

    tasks.splice(
      tasks.findIndex((t) => t.id === chosen.id),
      1,
    );
  }

  await prisma.task.createMany({
    data: usersTasks.map((task) => {
      return {
        task_id: task.id,
        prize: task.prizes[Math.floor(Math.random() * task.prizes.length)],
        user_id: userId,
        target: task.target[Math.floor(Math.random() * task.target.length)],
        type: task.type,
      };
    }),
  });
}

export async function getTasks(userId: string) {
  if (taskGeneration.has(userId)) {
    await sleep(50);
    return getTasks(userId);
  }

  taskGeneration.add(userId);

  setTimeout(() => {
    taskGeneration.delete(userId);
  }, 100);

  const cache = await redis.get(`${Constants.redis.cache.economy.TASKS}:${userId}`);

  if (cache) {
    taskGeneration.delete(userId);
    return JSON.parse(cache) as PrismaTask[];
  }

  const query = await prisma.task.findMany({
    where: { user_id: userId },
    orderBy: {
      task_id: "asc",
    },
  });

  if (query.length < 6) {
    logger.debug(`${userId} less than 6 tasks`);

    if (query.length === 0) {
      logger.debug(`${userId} generating daily and weeklies`);
      await generateDailyTasks(userId);
      await generateWeeklyTasks(userId);
    } else {
      logger.debug(`${userId} generating dailies`, { tasks: query });
      await generateDailyTasks(userId);
    }

    taskGeneration.delete(userId);
    return getTasks(userId);
  } else if (query.length > 6) {
    const dailies = query.filter((i) => i.type === "daily");
    const weeklies = query.filter((i) => i.type === "weekly");

    logger.debug(`${userId} more than 6 tasks`, {
      dailies: dailies.length,
      weeklies: weeklies.length,
    });

    if (dailies.length > 3) {
      await prisma.task.delete({
        where: {
          user_id_task_id: {
            task_id: dailies[0].task_id,
            user_id: dailies[0].user_id,
          },
        },
      });
    } else if (weeklies.length > 3) {
      await prisma.task.delete({
        where: {
          user_id_task_id: {
            task_id: weeklies[0].task_id,
            user_id: weeklies[0].user_id,
          },
        },
      });
    }
  }

  await redis.set(
    `${Constants.redis.cache.economy.TASKS}:${userId}`,
    JSON.stringify(query),
    "EX",
    3600,
  );

  taskGeneration.delete(userId);
  return query;
}

export async function getTaskStreaks(userId: string) {
  const query = await prisma.economy.findUnique({
    where: {
      userId,
    },
    select: {
      weeklyTaskStreak: true,
      dailyTaskStreak: true,
    },
  });

  return query;
}

export function parseReward(reward: string) {
  const parts = reward.split(":");

  const out: {
    type: "item" | "money" | "xp" | "karma";
    value: number;
    item?: Item;
  } = {
    type: "money",
    value: 1,
  };

  if (parts[0] === "id") {
    out.type = "item";
    out.item = getItems()[parts[1]];
    out.value = parseInt(parts[2] || "0") || 0;

    if (!out.item?.id) {
      delete out.item;
      out.value = 1;
      out.type = "money";
    }
  } else if (parts[0] === "money") {
    out.type = "money";
    out.value = parseInt(parts[1] || "0") || 0;
  } else if (parts[0] === "xp") {
    out.type = "xp";
    out.value = parseInt(parts[1] || "0") || 0;
  } else if (parts[0] === "karma") {
    out.type = "karma";
    out.value = parseInt(parts[1] || "0") || 0;
  }

  return out;
}

export async function addTaskProgress(userId: string, taskId: string, amount = 1) {
  if (!(await userExists(userId))) return;

  const tasks = await getTasks(userId);

  const task = tasks.find((i) => i.task_id === taskId);

  if (!task) return;
  if (task.completed) return;

  await redis.del(`${Constants.redis.cache.economy.TASKS}:${userId}`);

  if (Number(task.progress) + amount >= Number(task.target)) {
    await prisma.task.update({
      where: {
        user_id_task_id: {
          task_id: taskId,
          user_id: userId,
        },
      },
      data: {
        progress: task.target,
        completed: true,
      },
    });

    const reward = parseReward(task.prize);

    const embed = new CustomEmbed()
      .setHeader("task completed", await getLastKnownAvatar(userId))
      .setColor(Constants.EMBED_SUCCESS_COLOR);

    let desc = `you have completed the **${getTasksData()[task.task_id].name}** task`;

    switch (reward.type) {
      case "item":
        desc += `\n\nyou have received ${reward.value}x ${reward.item.emoji} ${reward.item.name}`;
        await addInventoryItem(task.user_id, reward.item.id, reward.value);
        break;
      case "karma":
        desc += `\n\nyou have received 🔮 ${reward.value} karma`;
        await addKarma(task.user_id, reward.value);
        break;
      case "money":
        desc += `\n\nyou have received $${reward.value.toLocaleString()}`;
        await updateBalance(task.user_id, (await getBalance(task.user_id)) + reward.value);
        break;
      case "xp":
        desc += `\n\nyou have received ${reward.value.toLocaleString()}xp`;
        await updateXp(task.user_id, (await getXp(task.user_id)) + reward.value);
        break;
    }

    embed.setDescription(desc);

    addInlineNotification({ embed, memberId: task.user_id });

    if (task.type === "daily") addTaskProgress(task.user_id, "all_dailies");
  } else {
    await prisma.task.update({
      where: { user_id_task_id: { user_id: userId, task_id: taskId } },
      data: { progress: { increment: amount } },
    });
  }
}

export async function setTaskProgress(userId: string, taskId: string, amount: number) {
  if (!(await userExists(userId))) return;

  const tasks = await getTasks(userId);

  const task = tasks.find((i) => i.task_id === taskId);

  if (!task) return;
  if (task.completed) return;

  await redis.del(`${Constants.redis.cache.economy.TASKS}:${userId}`);

  if (amount >= Number(task.target)) {
    await prisma.task.update({
      where: {
        user_id_task_id: {
          task_id: taskId,
          user_id: userId,
        },
      },
      data: {
        progress: task.target,
        completed: true,
      },
    });

    const reward = parseReward(task.prize);

    const embed = new CustomEmbed()
      .setHeader("task completed", await getLastKnownAvatar(userId))
      .setColor(Constants.EMBED_SUCCESS_COLOR);

    let desc = `you have completed the **${getTasksData()[task.task_id].name}** task`;

    switch (reward.type) {
      case "item":
        desc += `\n\nyou have received ${reward.value}x ${reward.item.emoji} ${reward.item.name}`;
        await addInventoryItem(task.user_id, reward.item.id, reward.value);
        break;
      case "karma":
        desc += `\n\nyou have received 🔮 ${reward.value} karma`;
        await addKarma(task.user_id, reward.value);
        break;
      case "money":
        desc += `\n\nyou have received $${reward.value.toLocaleString()}`;
        await updateBalance(task.user_id, (await getBalance(task.user_id)) + reward.value);
        break;
      case "xp":
        desc += `\n\nyou have received ${reward.value.toLocaleString()}xp`;
        await updateXp(task.user_id, (await getXp(task.user_id)) + reward.value);
        break;
    }

    embed.setDescription(desc);

    addInlineNotification({ embed, memberId: task.user_id });

    if (task.type === "daily") addTaskProgress(task.user_id, "all_dailies");
  } else {
    await prisma.task.update({
      where: { user_id_task_id: { user_id: userId, task_id: taskId } },
      data: { progress: amount },
    });
  }
}
