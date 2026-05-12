import prisma from "../../init/database";
import { createUser, userExists } from "./economy/utils";

export async function addRoleplayStat(
  userId: string,
  targetId: string,
  action: string,
): Promise<number> {
  if (!(await userExists(userId))) await createUser(userId);
  if (!(await userExists(targetId))) await createUser(targetId);

  const result = await prisma.roleplayStat.upsert({
    where: { userId_action_targetId: { userId, action, targetId } },
    update: { count: { increment: 1 } },
    create: { userId, targetId, action },
    select: { count: true },
  });

  return result.count;
}

export async function getRoleplayActionTotals(userId: string) {
  const rows = await prisma.roleplayStat.groupBy({
    where: { userId },
    by: ["action"],
    _sum: { count: true },
    orderBy: { _sum: { count: "desc" } },
  });

  return rows.map((r) => ({ action: r.action, count: r._sum.count }));
}

export async function getRoleplayTargetTotals(userId: string) {
  const rows = await prisma.roleplayStat.groupBy({
    where: { userId },
    by: ["targetId"],
    _sum: { count: true },
    orderBy: { _sum: { count: "desc" } },
    take: 5,
  });

  const withNames = await Promise.all(
    rows.map(async (r) => {
      const user = await prisma.user.findUnique({
        where: { id: r.targetId },
        select: { lastKnownUsername: true },
      });
      return { username: user?.lastKnownUsername ?? r.targetId, count: r._sum.count };
    }),
  );

  return withNames;
}

export async function getRoleplayStatsByAction(userId: string, action: string) {
  const rows = await prisma.roleplayStat.findMany({
    where: { userId, action },
    select: {
      targetId: true,
      count: true,
      target: { select: { lastKnownUsername: true } },
    },
    orderBy: { count: "desc" },
    take: 10,
  });

  return rows;
}
