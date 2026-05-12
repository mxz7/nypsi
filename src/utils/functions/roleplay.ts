import prisma from "../../init/database";

export async function addRoleplayStat(
  userId: string,
  targetId: string,
  action: string,
): Promise<number> {
  const result = await prisma.roleplayStat.upsert({
    where: { userId_action_targetId: { userId, action, targetId } },
    update: { count: { increment: 1 } },
    create: { userId, targetId, action },
    select: { count: true },
  });

  return result.count;
}
