import { MiddlewareHandler } from "hono";
import { performance } from "perf_hooks";
import { logger } from "../../utils/logger";

const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  const start = performance.now();

  await next();
  const duration = Math.round(performance.now() - start);

  logger.info(`api: ${c.req.method} ${c.req.path} - ${c.res.status} (${duration}ms)`);
};

export default loggerMiddleware;
