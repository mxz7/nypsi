import prisma from "../../database/database";
import { NypsiClient } from "../../models/Client";
import { expireUser } from "../../premium/utils";

export async function runPremiumChecks(client: NypsiClient) {
    setInterval(async () => {
        const now = new Date();

        const query = await prisma.premium.findMany({
            where: {
                expireDate: { lte: now },
            },
            select: {
                userId: true,
            },
        });

        for (const user of query) {
            await expireUser(user.userId, client);
        }
    }, 600000);
}
