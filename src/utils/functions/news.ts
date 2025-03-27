import redis from "../../init/redis";
import Constants from "../Constants";

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

export async function hasSeenNews(id: string) {
  if (!(await redis.exists(Constants.redis.nypsi.NEWS_SEEN))) return null;

  const index = await redis.lpos(Constants.redis.nypsi.NEWS_SEEN, id);

  if (index == null) return null;

  return index + 1;
}
