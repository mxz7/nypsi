import { Client } from "discord.js";
import { getCustomPresence, randomPresence } from "../utils/functions/presence";
import { logger } from "../utils/logger";

export default function ready(client: Client) {
    setTimeout(() => {
        if (getCustomPresence()) return;
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

    setInterval(() => {
        if (getCustomPresence()) return;
        const presence = randomPresence();

        client.user.setPresence({
            status: "dnd",
            activities: [
                {
                    name: presence,
                },
            ],
        });
    }, 30 * 60 * 1000);
}
