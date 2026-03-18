import { Hono } from "hono";
import redis from "../../init/redis";
import { logger } from "../../utils/logger";

const router = new Hono();
export default router;

router.delete("/", async (c) => {
  const keys = await c.req.text().then((r) => r.split("\n"));

  logger.info(`api: deleting redis keys (${keys.join(", ")})`);

  await redis.del(...keys);

  return c.body(null, 200);
});
