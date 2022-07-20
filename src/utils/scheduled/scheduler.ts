import Bree = require("bree");
import path = require("path");
import { getGuilds } from "../../nypsi";
import { logger } from "../logger";

const bree = new Bree({
    root: path.resolve("./jobs"),

    workerMessageHandler: (message) => {
        console.log(message);
        logger.info(`[${message.name}] ${message.message}`);
    },
    errorHandler: (message) => {
        logger.error(`[${message.name}] ${message.message}`);
    },

    jobs: [
        // {
        //     name: "purgeusernames",
        //     interval: "at 3:00am",
        //     path: path.join(__dirname, "jobs", "purgeusernames.js"),
        // },
        // {
        //     name: "topglobal",
        //     interval: "at 12:00am",
        //     path: path.join(__dirname, "jobs", "topglobal.js"),
        // },
        // {
        //     name: "workers",
        //     interval: "5m",
        //     path: path.join(__dirname, "jobs", "workers.js"),
        // },
        {
            name: "deleteguilds",
            interval: "at 3:01am",
            path: path.join(__dirname, "jobs", "oldguilds.js"),
            worker: {
                workerData: {
                    guilds: getGuilds(),
                },
            },
        },
    ],
});

export default async function startJobs() {
    await bree.start();
    await bree.run();

    console.log(getGuilds());
}
