import BeeQueue = require("bee-queue");
import { ClusterManager } from "discord-hybrid-sharding";
import redis from "../../init/redis";
import { NotificationPayload } from "../../types/Notification";
import requestDM from "../functions/requestdm";

const dmQueueHandler = new BeeQueue<NotificationPayload>("nypsi:dms", {
  redis: redis,
});

export function handleDmQueue(manager: ClusterManager) {
  dmQueueHandler.process(3, async (job) => {
    console.log(job.data);

    return await requestDM({
      client: manager,
      content: job.data.payload.content,
      memberId: job.data.memberId,
      components: job.data.payload.components,
      embed: job.data.payload.embed,
    });
  });
}
