import { REST } from "@discordjs/rest";
import { NypsiClient } from "../models/Client";

const rest = new REST().setToken(process.env.BOT_TOKEN!);

export function getRest(client?: NypsiClient): REST {
  if (client) {
    return client.rest;
  }

  return rest;
}
