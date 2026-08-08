import type { ModerationCreateParams } from "openai/resources/moderations";
import { logger } from "../../logger";
import openai from "./openai";

type ModerationContext = {
  source: string;
  userId: string;
};

export async function isUserContentAllowed(
  input: ModerationCreateParams["input"],
  context: ModerationContext,
) {
  try {
    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input,
    });
    const result = response.results[0];

    if (!result?.flagged) return true;

    logger.warn("moderation: blocked user content", {
      ...context,
      categories: Object.entries(result.categories)
        .filter(([, flagged]) => flagged)
        .map(([category]) => category),
    });
    return false;
  } catch (error) {
    logger.error("moderation: failed to moderate user content", { ...context, error });
    return false;
  }
}
