import redis from "../../../init/redis";
import { InlineNotificationPayload, NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { dmQueue } from "../../queues/queues";
import { getUserId, MemberResolvable } from "../member";

export function addNotificationToQueue(...payload: NotificationPayload[]) {
  return dmQueue.addBulk(
    payload.map((data) => ({
      name: data.memberId,
      data: {
        memberId: data.memberId,
        payload: {
          content: data.payload.content,
          embeds: data.payload.embed ? [data.payload.embed.toJSON()] : undefined,
          components: data.payload.components ? [data.payload.components.toJSON()] : undefined,
        },
      },
      opts: { attempts: 5, backoff: { type: "exponential", delay: 300000 } },
    })),
  );
}

export async function addInlineNotification(...payload: InlineNotificationPayload[]) {
  for (const p of payload) {
    await redis.sadd(`${Constants.redis.nypsi.INLINE_QUEUE}:${p.memberId}`, JSON.stringify(p));
  }
}

// gets max of 8 and clears
export async function getInlineNotifications(member: MemberResolvable) {
  const notifs = await redis.spop(`${Constants.redis.nypsi.INLINE_QUEUE}:${getUserId(member)}`, 8);

  return notifs.map((i) => JSON.parse(i) as InlineNotificationPayload);
}
