import prisma from "../../init/database";
import { Job } from "../../types/Jobs";

export default {
  name: "event progress snapshot",
  cron: "0 * * * *",
  async run(log) {
    const event = await prisma.event.findFirst({
      where: { endedAt: null },
      select: { id: true },
      orderBy: { id: "desc" },
    });

    if (!event) {
      log("no active event");
      return;
    }

    const progress = await prisma.eventContribution.aggregate({
      where: { eventId: event.id },
      _sum: { contribution: true },
    });
    const total = progress._sum.contribution ?? 0n;

    await prisma.botMetrics.create({
      data: {
        category: `event_progress_${event.id}`,
        value: Number(total),
      },
    });

    log(`saved ${total.toLocaleString()} progress for event ${event.id}`);
  },
} satisfies Job;
