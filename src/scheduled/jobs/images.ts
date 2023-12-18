import fetch from "node-fetch";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import { RedditJSON, RedditJSONPost } from "../../types/Reddit";
import sleep from "../../utils/functions/sleep";

const bdsmLinks = [
  "https://www.reddit.com/r/bdsm/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/bondage/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/dominated/top.json?limit=6969&t=month",
];
const thighsLinks = [
  "https://www.reddit.com/r/legs/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/thickthighs/top.json?limit=6969&t=month",
];
const boobLinks = [
  "https://www.reddit.com/r/Boobies/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/tits/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/TinyTits/top.json?limit=6969&t=month",
];
const assLinks = [
  "https://www.reddit.com/r/ass/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/facedownassup/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/assinthong/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/buttplug/top.json?limit=6969&t=month",
];
const pornLinks = [
  "https://www.reddit.com/r/legalteens/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/amateur/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/gonewild/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/cumsluts/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/creampies/top.json?limit=6969&t=month",
];
const feetLinks = [
  "https://www.reddit.com/r/feet/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/feetpics/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/Feet_NSFW/top.json?limit=6969&t=month",
];
const handLinks = [
  "https://www.reddit.com/r/ManHands/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/hands/top.json?limit=6969&t=month",
];
const birbLinks = [
  "https://www.reddit.com/r/birb/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/budgies/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/parrots/top.json?limit=6969&t=month",
];
const catLinks = [
  "https://www.reddit.com/r/cat/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/catsyawning/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/Kitten/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/kitty/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/catpics/top.json?limit=6969&t=month",
];
const dogLinks = [
  "https://www.reddit.com/r/dog/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/corgi/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/dogpictures/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/goldenretrievers/top.json?limit=6969&t=month",
];
const duckLinks = ["https://www.reddit.com/r/duck/top.json?limit=6969&t=month"];
const lizardLinks = [
  "https://www.reddit.com/r/Lizards/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/BeardedDragons/top.json?limit=6969&t=month",
];
const rabbitLinks = ["https://www.reddit.com/r/rabbits/top.json?limit=6969&t=month"];

async function cacheUpdate(links: string[], name: string, log: (message: string) => void) {
  await redis.del(`nypsi:images:${name}`);

  for (const link of links) {
    await sleep(10000);

    const res: RedditJSON = await fetch(link).then(async (res) => {
      if (res.status === 403) {
        log(`blocked for ${link}. attempting to fetch again`);
        res = await fetch(link);
        if (res.ok) {
          return res.json();
        } else {
          log(`failed - skipping`);
          return { message: "skip" };
        }
      }
      return res.json();
    });

    if (res.message === "skip") {
      continue;
    } else if (res.message == "Forbidden") {
      if (res.reason === "private") {
        log(`skipped ${link} due to private subreddit`);
      } else {
        log(`skipped ${link} due to 403 (forbidden)`);
      }
      continue;
    }

    let allowed: RedditJSONPost[];

    try {
      allowed = res.data.children.filter((post) => !post.data.is_self);
    } catch {
      log(`failed processing ${link}`);
    }

    if (allowed) {
      await redis.lpush(`nypsi:images:${name}`, ...allowed.map((i) => JSON.stringify(i)));
    } else {
      log(`no images @ ${link}`);
    }
  }

  await redis.expire(`nypsi:images:${name}`, 604800); // 7 days
  await sleep(10000);
}

export default {
  name: "images",
  cron: "0 0 * * 0",
  async run(log) {
    await cacheUpdate(bdsmLinks, "bdsm", log);
    await cacheUpdate(thighsLinks, "thighs", log);
    await cacheUpdate(boobLinks, "boob", log);
    await cacheUpdate(assLinks, "ass", log);
    await cacheUpdate(pornLinks, "porn", log);
    await cacheUpdate(feetLinks, "feet", log);
    await cacheUpdate(handLinks, "hands", log);
    await cacheUpdate(birbLinks, "birb", log);
    await cacheUpdate(catLinks, "cat", log);
    await cacheUpdate(dogLinks, "dog", log);
    await cacheUpdate(duckLinks, "duck", log);
    await cacheUpdate(lizardLinks, "lizard", log);
    await cacheUpdate(rabbitLinks, "rabbit", log);
  },
} satisfies Job;
