import { ClusterManager } from "discord-hybrid-sharding";
import { MessageCreateOptions } from "discord.js";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import Constants from "../Constants";
import { getUserId, MemberResolvable } from "./member";

type News = {
  text: string;
  date: number;
};

export async function getNews(): Promise<News> {
  const news = await redis.get(Constants.redis.nypsi.NEWS);

  if (!news) {
    return { text: "", date: 0 };
  }

  return JSON.parse(news);
}

export async function setNews(string: string) {
  await redis.del(Constants.redis.nypsi.NEWS_SEEN);

  await redis.set(
    Constants.redis.nypsi.NEWS,
    JSON.stringify({ text: string, date: Date.now() }),
    "EX",
    86400 * 7,
  );
}

export async function hasSeenNews(member: MemberResolvable) {
  if (!(await redis.exists(Constants.redis.nypsi.NEWS_SEEN))) return null;

  const index = await redis.lpos(Constants.redis.nypsi.NEWS_SEEN, getUserId(member));

  if (index == null) return null;

  return index + 1;
}

export async function sendToAnnouncements(
  client: NypsiClient | ClusterManager,
  payload: MessageCreateOptions,
) {
  const cluster = client instanceof NypsiClient ? client.cluster : client;

  cluster.broadcastEval(
    async (c, { payload }) => {
      const channel = c.channels.cache.get(Constants.ANNOUNCEMENTS_CHANNEL_ID);

      if (!channel || !channel.isSendable() || !channel.isTextBased()) return;

      // @ts-expect-error fuck discordjs it's a fucking message payload stupid fucking types
      await channel.send(payload);
    },
    { context: { payload } },
  );
}
