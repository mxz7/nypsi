import { Queue } from "bullmq";
import redis from "../../init/redis";
import { NotificationPayload } from "../../types/Notification";

export const dmQueue = new Queue<NotificationPayload>("dms", { connection: redis });
