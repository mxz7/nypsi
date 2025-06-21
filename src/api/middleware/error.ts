import { Request, Response } from "express";
import { logger } from "../../utils/logger";

export interface AppError extends Error {
  status?: number;
}

function errorHandler(err: AppError, request: Request, response: Response) {
  console.error(err);
  logger.error(`api: internal server error`, err);
  response.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
}

export default errorHandler;
