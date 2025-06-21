import { NextFunction, Request, Response } from "express";
import { logger } from "../../utils/logger";

function logMiddleware(request: Request, response: Response, next: NextFunction) {
  logger.debug(`api: ${request.method} ${request.path}`, {
    body: request.body ? request.body : undefined,
  });
  next();
}

export default logMiddleware;
