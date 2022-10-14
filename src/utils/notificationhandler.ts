import { Manager } from "discord-hybrid-sharding";
import redis from "./database/redis";
import requestDM from "./functions/requestdm";

export async function doDmQueueInterval(manager: Manager) {
  setInterval(async () => {
    if ((await redis.llen("nypsi:dm:queue")) == 0) return;

    const item = JSON.parse(await redis.rpop("nypsi:dm:queue"));

    await requestDM({
      client: manager,
      content: item.content,
      memberId: item.memberId,
      embed: item.embed,
      components: item.components,
    });
  }, 10000);
}
