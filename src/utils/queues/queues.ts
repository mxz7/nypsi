import BeeQueue = require("bee-queue");
import redis from "../../init/redis";
import { NotificationPayload } from "../../types/Notification";

export const dmQueue = new BeeQueue<NotificationPayload>("nypsi:dms", {
  redis: redis,
  isWorker: false,
});
