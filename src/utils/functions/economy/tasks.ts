import { Task as PrismaTask } from "@prisma/client";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import { Task } from "../../../types/Tasks";
import Constants from "../../Constants";
import { addKarma } from "../karma/karma";
import { addInlineNotification } from "../users/notifications";
import { getLastKnownAvatar } from "../users/tag";
import { getBalance, updateBalance } from "./balance";
import { addInventoryItem } from "./inventory";
import { getItems, getTasksData, userExists } from "./utils";
import { getXp, updateXp } from "./xp";

export async function generateTasks(userId: string) {
  await prisma.task.deleteMany({ where: { user_id: userId } });
  await redis.del(`${Constants.redis.cache.economy.TASKS}:${userId}`);

  const tasks = getTasksData();

  const dailyTasks = Object.values(tasks).filter((i) => i.type === "daily");
  const weeklyTasks = Object.values(tasks).filter((i) => i.type === "weekly");

  const usersTasks: Task[] = [];

  for (let i = 0; i < 3; i++) {
    const chosen = dailyTasks[Math.floor(Math.random() * dailyTasks.length)];

    usersTasks.push(chosen);

    dailyTasks.splice(dailyTasks.indexOf(chosen), 1);
  }

  usersTasks.push(tasks["all_dailies"]);

  weeklyTasks.splice(
    weeklyTasks.findIndex((i) => i.id === "all_dailies"),
    1,
  );

  for (let i = 0; i < 2; i++) {
    const chosen = weeklyTasks[Math.floor(Math.random() * weeklyTasks.length)];

    usersTasks.push(chosen);

    weeklyTasks.splice(weeklyTasks.indexOf(chosen), 1);
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

  await redis.del(`${Constants.redis.cache.economy.TASKS}:${userId}`);
}

export async function getTasks(userId: string) {
  const cache = await redis.get(`${Constants.redis.cache.economy.TASKS}:${userId}`);

  if (cache) {
    return JSON.parse(cache) as PrismaTask[];
  }

  const query = await prisma.task.findMany({ where: { user_id: userId } });

  if (query.length === 0) {
    await generateTasks(userId);
    return getTasks(userId);
  }

  await redis.set(
    `${Constants.redis.cache.economy.TASKS}:${userId}`,
    JSON.stringify(query),
    "EX",
    3600,
  );

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

  if (Number(task.progress) + amount > Number(task.target)) {
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
