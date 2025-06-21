import * as express from "express";
import { logger } from "../utils/logger";
import { index } from "./controllers/indexController";
import errorHandler from "./middleware/error";
import logMiddleware from "./middleware/logger";

const app = express();

// middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logMiddleware);

// routes
app.get("/", index);

// after routes
app.use(errorHandler);

export function startAPI() {
  app.listen(process.env.EXPRESS_PORT || 5000);

  logger.info(`api: running on port ${process.env.EXPRESS_PORT || 5000}`);
}
