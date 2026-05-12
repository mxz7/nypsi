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
