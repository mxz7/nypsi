import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { logger } from "../utils/logger";
import achievementController from "./controllers/achievements";
import itemController from "./controllers/item";
import kofiController from "./controllers/kofi";
import redisController from "./controllers/redis";
import statusController from "./controllers/status";
import systemController from "./controllers/system";
import voteController from "./controllers/vote";
import loggerMiddleware from "./middleware/logger";

const app = new Hono();

app.use(loggerMiddleware);

app.get("/", (c) => {
  return c.json({ meow: "meow" });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

const authedApp = new Hono();

authedApp.use(bearerAuth({ token: process.env.API_AUTH }));

app.route("/kofi", kofiController);
app.route("/vote", voteController);

authedApp.route("/", statusController);
authedApp.route("/", systemController);
authedApp.route("/achievement", achievementController);
authedApp.route("/items", itemController);
authedApp.route("/redis", redisController);

app.route("/", authedApp);

export function startAPI() {
  serve({ fetch: app.fetch, port: parseInt(process.env.API_PORT) || 5000 });

  logger.info(`api: running on port ${process.env.API_PORT || 5000}`);
}
