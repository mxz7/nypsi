import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";

const helpContent = [
  "i need help",
  "i need mod",
  "i need staff",
  "help me staff",
  "who is owner",
  "help me owner",
  "i got scammed",
  "i found a glitch",
  "i found a bug",
  "i found a problem",
  "i need support",
];

const messages: Record<string, string> = {
  help: `need help? you can dm <@${Constants.BOT_USER_ID}> to create a support request and talk directly to staff`,
};

const triggers = new Map<RegExp, { response: string; maxLevel?: number }>();

triggers.set(new RegExp(helpContent.join("|"), "i"), { response: messages.help });

const triggerCooldown = new Set<string>();

export async function checkTriggers(userId: string, content: string) {
  if (content.length < 10) {
    return;
  }

  if (triggerCooldown.has(userId)) {
    return;
  }

  const level = await getRawLevel(userId);

  for (const [trigger, { response, maxLevel }] of triggers.entries()) {
    if (maxLevel && level > maxLevel) continue;

    if (trigger.test(content)) {
      return triggered(userId, response);
    }
  }
}

function triggered(userId: string, response: string) {
  triggerCooldown.add(userId);
  setTimeout(() => {
    triggerCooldown.delete(userId);
  }, 15000);

  return new CustomEmbed(userId, response);
}
