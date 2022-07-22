import prisma from "../../database/database";
import { expireUser } from "../../premium/utils";

export async function runPremiumChecks() {
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
            await expireUser(user.userId);
        }
    }, 600000);
}
