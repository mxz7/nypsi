import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";
import { checkStatus } from "..";
import redis from "../init/redis";
import { setProgress } from "../utils/functions/economy/achievements";
import { calcItemValue } from "../utils/functions/economy/inventory";
import { logger } from "../utils/logger";
import kofi from "./controllers/kofi";
import vote from "./controllers/vote";

const app = new Hono();

// middlewares
app.use(async (c, next) => {
  let body: any;

  try {
    body = await c.req.json();
  } catch {
    // do nothing
  }

  logger.debug(`api: ${c.req.method} ${c.req.path}`, {
    body: body || undefined,
  });
  await next();
});

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
  const itemId = c.req.param("item");
  const value = await calcItemValue(itemId);
  return c.json({ value });
});

app.route("/vote", vote);
app.route("/kofi", kofi);

app.onError((err, c) => {
  logger.warn(`api: error ${c.req.method} ${c.req.path}`, err);

  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  c.status(500);
  return c.json({
    message: err.message || "Internal Server Error",
  });
});

export function startAPI() {
  serve({ fetch: app.fetch, port: parseInt(process.env.EXPRESS_PORT) || 5000 });

  logger.info(`api: running on port ${process.env.EXPRESS_PORT || 5000}`);
}
