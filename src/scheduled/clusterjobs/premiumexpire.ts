import prisma from "../../init/database";
import { expireUser } from "../../utils/functions/premium/premium";
import { NypsiClient } from "../../utils/models/Client";

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
