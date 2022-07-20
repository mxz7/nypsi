import Bree = require("bree/types");

const bree = new Bree({
    jobs: [
        {
            name: "purgeusernames",
            interval: "at 3:00am",
        },
        {
            name: "topglobal",
            interval: "at 12:00am",
        },
    ],
});

export default async function startJobs() {
    await bree.start();
}
