import { Task as PrismaTask } from "@prisma/client";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { Task } from "../../../types/Tasks";
import Constants from "../../Constants";
import { getTasksData } from "./utils";

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
