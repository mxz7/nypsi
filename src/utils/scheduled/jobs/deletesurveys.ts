import dayjs = require("dayjs");
import prisma from "../../database/database";
import { logger } from "../../logger";

(async () => {
    const limit = dayjs().subtract(2, "days").toDate();

    const { count } = await prisma.survey.deleteMany({
        where: {
            resultsAt: { lte: limit },
        },
    });

    if (count > 0) {
        logger.info(`${count.toLocaleString()} surveys deleted`);
    }
})();
