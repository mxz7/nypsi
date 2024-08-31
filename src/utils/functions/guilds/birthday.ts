import prisma from "../../../init/database";

export async function setBirthdayChannel(guildId: string, hook: string | null) {
  await prisma.guild.update({ where: { id: guildId }, data: { birthdayHook: hook } });
}
