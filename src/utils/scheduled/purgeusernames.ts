import dayjs = require("dayjs");
import prisma from "../database/database";
import { MStoTime } from "../functions/date";
import { logger } from "../logger";

export default function purgeUsernames() {
    const now = new Date();

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
    }

    const needed = new Date(Date.parse(d) + 10800000);

    const purge = async () => {
        const old = dayjs().subtract(180, "days").toDate().getTime();

        const d = await prisma.username.deleteMany({
            where: {
                AND: [{ type: "username" }, { date: { lt: old } }],
            },
        });

        logger.log("auto", `${d.count.toLocaleString()} old usernames deleted from database`);
    };

    setTimeout(async () => {
        setInterval(() => {
            purge();
        }, 86400000);
        purge();
    }, needed.getTime() - now.getTime());

    logger.log({
        level: "auto",
        message: `old usernames will be purged in ${MStoTime(needed.getTime() - now.getTime())}`,
    });
}
