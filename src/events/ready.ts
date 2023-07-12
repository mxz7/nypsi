import { Client } from "discord.js";
import { getCustomPresence, randomPresence } from "../utils/functions/presence";

export default function ready(client: Client) {
  setTimeout(async () => {
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
  }, 15000);

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
