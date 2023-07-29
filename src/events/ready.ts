import { Client } from "discord.js";
import { getCustomPresence, randomPresence, setCustomPresence } from "../utils/functions/presence";

export default async function ready(client: Client) {
  await setCustomPresence();
  client.user.setPresence({
    status: "dnd",
    activities: [
      {
        name: "nypsi.xyz",
      },
    ],
  });

  setInterval(
    async () => {
      if (await getCustomPresence()) return;
      const presence = randomPresence();

      client.user.setPresence({
        status: "dnd",
        activities: [
          {
            name: presence,
          },
        ],
      });
    },
    30 * 60 * 1000,
  );
}
