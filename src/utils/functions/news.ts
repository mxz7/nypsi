import redis from "../database/redis";

type News = {
  text: string;
  date: number;
};

export async function getNews(): Promise<News> {
  const news = await redis.get("nypsi:news");

  if (!news) {
    return { text: "", date: 0 };
  }

  return JSON.parse(news);
}

export async function setNews(string: string) {
  await redis.del("nypsi:news:seen");

  await redis.set("nypsi:news", JSON.stringify({ text: string, date: Date.now() }));
  await redis.expire("nypsi:news", 86400 * 3);
}

export async function hasSeenNews(id: string) {
  if (!(await redis.exists("nypsi:news:seen"))) return null;

  const index = await redis.lpos("nypsi:news:seen", id);

  if (index == null) return null;

  return index + 1;
}
