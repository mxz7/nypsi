import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { checkStatus, manager } from "..";
import redis from "../init/redis";
import { setProgress } from "../utils/functions/economy/achievements";
import { calcItemValue } from "../utils/functions/economy/inventory";
import sleep from "../utils/functions/sleep";
import { logger } from "../utils/logger";
import itemController from "./controllers/item";
import kofiController from "./controllers/kofi";
import voteController from "./controllers/vote";
import loggerMiddleware from "./middleware/logger";
import ms = require("ms");

const app = new Hono();

app.use(loggerMiddleware);

// routes
app.get("/", (c) => {
  return c.json({ meow: "meow" });
});

app.get("/status", bearerAuth({ token: process.env.API_AUTH }), async (c) => {
  const status = await checkStatus();

  return c.json(status);
});

app.post(
  "/achievement/animal_lover/progress/:userid",
  bearerAuth({ token: process.env.API_AUTH }),
  async (c) => {
    let body: { progress: number };

    try {
      body = await c.req.json();
    } catch {
      c.status(400);
      return c.json({ error: "invalid body" });
    }

    if (!body.progress) {
      c.status(400);
      return c.json({ error: "invalid body" });
    }

    const userId = c.req.param("userid");
    await setProgress(userId, "animal_lover", body.progress);
    return c.body(null, 200);
  },
);

app.delete("/redis", bearerAuth({ token: process.env.API_AUTH }), async (c) => {
  const keys = await c.req.text().then((r) => r.split("\n"));

  logger.info(`api: deleting redis keys (${keys.join(", ")})`);

  await redis.del(...keys);

  return c.body(null, 200);
});

app.get("/item/value/:itemId", bearerAuth({ token: process.env.API_AUTH }), async (c) => {
  const itemId = c.req.param("itemId");
  const value = await calcItemValue(itemId);
  return c.json({ value });
});

app.post("/reboot", bearerAuth({ token: process.env.API_AUTH }), async (c) => {
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

app.post("/pausestreak", bearerAuth({ token: process.env.API_AUTH }), async (c) => {
  await redis.set("nypsi:streakpause", 69, "EX", ms("1 day") / 1000);
  return c.body("streaks will be paused for the next 24 hours", 200);
});

app.route("/vote", voteController);
app.route("/kofi", kofiController);
app.route("/items", itemController);

// app.onError((err, c) => {
//   logger.warn(`api: error ${c.req.method} ${c.req.path}`, err);

//   if (err instanceof HTTPException) {
//     return err.getResponse();
//   }

//   c.status(500);
//   return c.json({
//     message: err.message || "Internal Server Error",
//   });
// });

export function startAPI() {
  serve({ fetch: app.fetch, port: parseInt(process.env.EXPRESS_PORT) || 5000 });

  logger.info(`api: running on port ${process.env.EXPRESS_PORT || 5000}`);
}
