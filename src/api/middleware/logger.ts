import { performance } from "perf_hooks";
import { MiddlewareHandler } from "hono";
import { logger } from "../../utils/logger";

const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  const start = performance.now();

  await next();
  const duration = (performance.now() - start).toFixed(1);

  logger.info(`api: ${c.req.method} ${c.req.path} - ${c.res.status} (${duration}ms)`);
};

export default loggerMiddleware;
