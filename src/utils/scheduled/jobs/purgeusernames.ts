import dayjs = require("dayjs");
import prisma from "../../database/database";
import { logger } from "../../logger";

(async () => {
    const old = dayjs().subtract(180, "days").toDate();

    const d = await prisma.username.deleteMany({
        where: {
            AND: [{ type: "username" }, { date: { lt: old } }],
        },
    });

    logger.log("auto", `${d.count.toLocaleString()} old usernames deleted from database`);
})();
