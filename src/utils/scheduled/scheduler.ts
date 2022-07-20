import Bree = require("bree");
import path = require("path");
import { logger } from "../logger";

const bree = new Bree({
    root: path.resolve("./jobs"),
    outputWorkerMetadata: true,

    workerMessageHandler: (message, metadata) => {
        logger.info(`[${metadata.name}] ${message}`);
    },
    errorHandler: (message, metadata) => {
        logger.error(`error running job ${metadata.name}`);
        logger.error(message);
    },

    jobs: [
        {
            name: "purgeusernames",
            interval: "at 3:00am",
            path: path.join(__dirname, "jobs", "purgeusernames.js"),
        },
        {
            name: "topglobal",
            interval: "at 12:00am",
            path: path.join(__dirname, "jobs", "topglobal.js"),
        },
        {
            name: "workers",
            interval: "5m",
            path: path.join(__dirname, "jobs", "workers.js"),
        },
    ],
});

export default async function startJobs() {
    await bree.start();
    // await bree.run();
}
