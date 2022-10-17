import prisma from "../../../init/database";

export async function getEmail(id: string) {
  const query = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      email: true,
    },
  });

  return query.email;
}

export async function setEmal(id: string, email: string) {
  return await prisma.user.update({
    where: {
      id,
    },
    data: {
      email,
    },
  });
}
