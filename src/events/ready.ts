import { Client } from "discord.js";
// @ts-expect-error typescript doesnt like opening package.json
import { version } from "../../package.json";
import { commandsSize } from "../utils/commandhandler";
import { getCustomPresence, randomPresence } from "../utils/functions/presence";
import { logger } from "../utils/logger";

export default function ready(client: Client, startUp: number) {
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

    let memberCount = 0;

    client.guilds.cache.forEach((g) => {
        memberCount = memberCount + g.memberCount;
    });

    logger.info("server count: " + client.guilds.cache.size.toLocaleString());
    logger.info("user count: " + memberCount.toLocaleString());
    logger.info("commands count: " + commandsSize);
    logger.info(`version: ${version}`);

    logger.info("logged in as " + client.user.tag);

    const now = Date.now();
    const timeTaken = (now - startUp) / 1000;

    logger.info(`time taken: ${timeTaken}s\n`);
}
