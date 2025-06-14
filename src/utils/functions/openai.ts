import OpenAI from "openai";
import redis from "../../init/redis";
import Constants from "../Constants";
import { logger } from "../logger";
import ms = require("ms");

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

export default openai;

export async function prompt(instructions: string, text: string) {
  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-nano",
      instructions,
      input: text,
    });

    return response.output_text;
  } catch (e) {
    console.error(e);
    logger.error("openai prompt error", e);
    return "failed to prompt gpt";
  }
}

export async function getDocsRaw() {
  try {
    const cache = await redis.get(Constants.redis.nypsi.DOCS_CONTENT);

    if (cache) {
      return cache;
    }

    const docs = await fetch("https://nypsi.xyz/llms.txt").then((res) => res.text());

    await redis.set(Constants.redis.nypsi.DOCS_CONTENT, docs, "EX", ms("1 day") / 1000);

    return docs;
  } catch (e) {
    console.error(e);
    logger.error(`openai: failed to get llms docs`);
    return "";
  }
}
