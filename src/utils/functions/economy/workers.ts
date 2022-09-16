import { GuildMember } from "discord.js";
import prisma from "../../database/database";
import { Constructor, getAllWorkers, Worker, WorkerStorageData } from "../../models/Workers";

export async function getWorkers(member: GuildMember | string): Promise<{ [key: string]: WorkerStorageData }> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      workers: true,
    },
  });

  return query.workers as any;
}

export async function addWorker(member: GuildMember, id: number) {
  let memberID: string;
  if (member instanceof GuildMember) {
    memberID = member.user.id;
  } else {
    memberID = member;
  }

  const workers = getAllWorkers();

  let worker: Constructor<Worker> | Worker = workers.get(id);

  if (!worker) return;

  worker = new worker();

  const memberWorkers = await getWorkers(member);

  memberWorkers[id] = worker.toStorage();

  await prisma.economy.update({
    where: {
      userId: memberID,
    },
    data: {
      workers: memberWorkers as any,
    },
  });
}

export async function emptyWorkersStored(member: GuildMember | string) {
  let memberID: string;
  if (member instanceof GuildMember) {
    memberID = member.user.id;
  } else {
    memberID = member;
  }

  const workers = await getWorkers(memberID);

  for (const w of Object.keys(workers)) {
    workers[w].stored = 0;
  }

  await prisma.economy.update({
    where: {
      userId: memberID,
    },
    data: {
      workers: workers as any,
    },
  });
}

export async function upgradeWorker(member: GuildMember | string, id: string) {
  let memberID: string;
  if (member instanceof GuildMember) {
    memberID = member.user.id;
  } else {
    memberID = member;
  }

  const workers = await getWorkers(memberID);

  const worker = Worker.fromStorage(workers[id]);

  worker.upgrade();

  workers[id] = worker.toStorage();

  await prisma.economy.update({
    where: {
      userId: memberID,
    },
    data: {
      workers: workers as any,
    },
  });
}
