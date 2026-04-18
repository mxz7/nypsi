import { REST } from "@discordjs/rest";
import { NypsiClient } from "../models/Client";

const rest = new REST().setToken(process.env.BOT_TOKEN!);

rest.on("rateLimited", (info) => {
  console.warn(`rest: rate limited: ${info.route} ${info.timeToReset}ms until reset`, { ...info });
});

export function getRest(client?: NypsiClient): REST {
  if (client) {
    return client.rest;
  }

  return rest;
}
