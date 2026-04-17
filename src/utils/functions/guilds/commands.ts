import prisma from "../../../init/database";

const lastCommand = new Map<string, { timestamp: number; storedAt: number }>();

export function getLastCommandSync(guildId: string) {
  const data = lastCommand.get(guildId);

  if (!data) {
    (async () => {
      const lastCommandDate = await getLastCommand(guildId);

      lastCommand.set(guildId, {
        timestamp: lastCommandDate ? lastCommandDate.getTime() : 0,
        storedAt: Date.now(),
      });
    })();
    return null;
  }

  lastCommand.set(guildId, { timestamp: data.timestamp, storedAt: Date.now() });

  return data.timestamp;
}

export async function getLastCommand(guildId: string) {
  const query = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { lastCommand: true },
  });

  return query?.lastCommand || null;
}

export function setLastCommand(guildId: string, timestamp: number) {
  lastCommand.set(guildId, { timestamp, storedAt: Date.now() });
}
