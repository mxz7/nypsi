import prisma from "../../../init/database";

export async function setBirthdayChannel(guildId: string, hook: string) {
  await prisma.guild.update({ where: { id: guildId }, data: { birthdayHook: hook } });
}
