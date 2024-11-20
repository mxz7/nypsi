import BeeQueue = require("bee-queue");
import redis from "../../init/redis";
import { NotificationPayload } from "../../types/Notification";
import { MentionQueueItem } from "../functions/users/mentions";

export const dmQueue = new BeeQueue<NotificationPayload>("nypsi:dms", {
  redis: redis,
  isWorker: false,
});

export const mentionQueue = new BeeQueue<MentionQueueItem>("nypsi:mentions", {
  redis: redis,
  isWorker: false,
});
