import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { checkStatus } from "..";
import { logger } from "../utils/logger";

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

app.get("/status", async (c) => {
  const status = await checkStatus();

  return c.json(status);
});

app.onError((err, c) => {
  console.error(err);

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
