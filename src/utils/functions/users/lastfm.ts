export async function getLastfmUsername(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`cache:user:lastfm:${id}`)) {
    return await redis.get(`cache:user:lastfm:${id}`);
  } else {
    const query = await prisma.user.findUnique({
      where: {
        id: id,
      },
      select: {
        lastfmUsername: true,
      },
    });

    if (query && query.lastfmUsername) {
      await redis.set(`cache:user:lastfm:${id}`, query.lastfmUsername);
      await redis.expire(`cache:user:lastfm:${id}`, ms("1 hour") / 1000);
      return query.lastfmUsername;
    } else {
      return undefined;
    }
  }
}

export async function setLastfmUsername(member: GuildMember, username: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  username = cleanString(username);

  const res = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`
  ).then((res) => res.json());

  if (res.error && res.error == 6) return false;

  await redis.del(`cache:user:lastfm:${id}`);

  await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      lastfmUsername: username,
    },
  });

  return true;
}
