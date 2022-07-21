import _ = require("lodash");
import prisma from "../../database/database";
import { Worker, WorkerStorageData } from "../../economy/workers";

(async () => {
    const query = await prisma.economy.findMany({
        select: {
            userId: true,
            workers: true,
        },
    });

    for (const user of query) {
        const workers: { [key: string]: WorkerStorageData } = user.workers as any;

        if (_.isEmpty(workers)) continue;

        for (const w of Object.keys(workers)) {
            const worker = workers[w];

            const workerData = Worker.fromStorage(worker);

            if (worker.stored < workerData.maxStorage) {
                if (worker.stored + workerData.perInterval > workerData.maxStorage) {
                    worker.stored = workerData.maxStorage;
                } else {
                    worker.stored += workerData.perInterval;
                }
            }
        }

        await prisma.economy.update({
            where: {
                userId: user.userId,
            },
            data: {
                workers: workers as any,
            },
        });
    }
})();
