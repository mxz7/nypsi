import { RedditJSON, RedditJSONPost } from "../../types/Reddit";
import { logger } from "../logger";

const images = new Map<string, Map<string, RedditJSONPost[]>>();

const bdsmLinks = [
  "https://www.reddit.com/r/bdsm/top.json?limit=6969&t=month",
  "https://www.reddit.com/r/bondage/top.json?limit=6969&t=month",
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
const snekLinks = ["https://www.reddit.com/r/snek/top.json?limit=6969&t=month"];

async function cacheUpdate(links: string[], name: string) {
  const map = new Map<string, RedditJSONPost[]>();

  for (const link of links) {
    const res: RedditJSON = await fetch(link).then((a) => a.json());

    if (res.message == "Forbidden") {
      logger.warn(`skipped ${link} due to private subreddit`);
      continue;
    }

    let allowed;

    try {
      allowed = res.data.children.filter((post) => !post.data.is_self);
    } catch {
      logger.error(`failed processing ${link}`);
    }

    if (allowed) {
      map.set(link, allowed);
    } else {
      logger.error(`no images @ ${link}`);
    }
  }

  images.set(name, map);
}

export async function updateCache() {
  const start = new Date().getTime();
  logger.log({
    level: "img",
    message: "img caches updating..",
  });
  await cacheUpdate(bdsmLinks, "bdsm");
  await cacheUpdate(thighsLinks, "thighs");
  await cacheUpdate(boobLinks, "boob");
  await cacheUpdate(assLinks, "ass");
  await cacheUpdate(pornLinks, "porn");
  await cacheUpdate(feetLinks, "feet");
  await cacheUpdate(handLinks, "hands");
  await cacheUpdate(birbLinks, "birb");
  await cacheUpdate(catLinks, "cat");
  await cacheUpdate(dogLinks, "dog");
  await cacheUpdate(duckLinks, "duck");
  await cacheUpdate(lizardLinks, "lizard");
  await cacheUpdate(rabbitLinks, "rabbit");
  await cacheUpdate(snekLinks, "snek");
  const end = new Date().getTime();
  const total = (end - start) / 1000 + "s";
  logger.log({
    level: "img",
    message: "images updated (" + total + ")",
  });
}

export { images };
