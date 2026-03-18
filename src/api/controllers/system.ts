import { Hono } from "hono";
import { manager } from "../..";
import redis from "../../init/redis";
import sleep from "../../utils/functions/sleep";
import { logger } from "../../utils/logger";
import ms = require("ms");

const router = new Hono();
export default router;

router.post("/reboot", async (c) => {
  logger.info(`api: forced reboot triggered`);

  setTimeout(async () => {
    logger.info(`api: killing clusters...`);
    manager.clusters.forEach((c) => c.kill({ force: true, reason: "triggered by API" }));

    logger.info(`api: killing process in 5 seconds...`);
    await sleep(5000);
    process.exit(0);
  }, 3000);

  return c.body(null, 200);
});

router.post("/pausestreak", async (c) => {
  await redis.set("nypsi:streakpause", 69, "EX", ms("1 day") / 1000);
  return c.body("streaks will be paused for the next 24 hours", 200);
});
