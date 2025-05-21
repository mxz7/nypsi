import OpenAI from "openai";
import { logger } from "../logger";

const openAiClient = new OpenAI({ apiKey: process.env.OPENAI_KEY });

export async function prompt(instructions: string, text: string) {
  try {
    const response = await openAiClient.responses.create({
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
