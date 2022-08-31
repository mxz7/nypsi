import redis from "../database/redis";

type News = {
    text: string;
    date: number;
};

export async function getNews(): Promise<News> {
    const news = await redis.get("nypsi:news");

    if (!news) {
        return null;
    }

    return JSON.parse(news);
}

export function setNews(string: string) {
    return redis.set("nypsi:news", JSON.stringify({ text: string, date: Date.now() }));
}
