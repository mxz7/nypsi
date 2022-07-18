import { Client } from "discord.js";
import { getRandomCommand } from "../commandhandler";
import { daysUntilChristmas } from "./date";

let current = "";

export function updatePresence(presence = "", client: Client) {
    current = presence;

    client.user.setPresence({
        status: "dnd",
        activities: [
            {
                name: current,
            },
        ],
    });
}

export function randomPresence(): string {
    const possibilities = ["$help | nypsi.xyz", "$help | tekoh.net", "$help | nypsi.xyz", "x0x", "xmas"];

    const chosen = possibilities[Math.floor(Math.random() * possibilities.length)];

    let game = "";

    if (chosen === "x0x") {
        const randomCommand = getRandomCommand();

        game = `$${randomCommand.name} - ${randomCommand.description}`;
    } else if (chosen === "xmas") {
        game = `${daysUntilChristmas()} days until christmas`;
    } else {
        game = chosen;
    }

    return game;
}

export function getCustomPresence(): null | string {
    if (current === "") {
        return null;
    } else {
        return current;
    }
}

export function setCustomPresence(text?: string) {
    current = text;
}
