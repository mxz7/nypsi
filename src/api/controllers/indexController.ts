import { NextFunction, Request, Response } from "express";

export function index(request: Request, response: Response, next: NextFunction) {
  try {
    response.json({ meow: "meow" });
  } catch (error) {
    next(error);
  }
}
