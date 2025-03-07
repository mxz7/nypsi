import BeeQueue = require("bee-queue");
import { ClusterManager } from "discord-hybrid-sharding";
import {
  ActionRowBuilder,
  APIEmbed,
  BaseMessageOptions,
  MessageActionRowComponentBuilder,
  MessagePayload,
} from "discord.js";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { NotificationPayload } from "../../types/Notification";
import { isUserBlacklisted } from "../functions/users/blacklist";
import { getDmSettings, updateDmSettings } from "../functions/users/notifications";
import { logger } from "../logger";

const dmQueueHandler = new BeeQueue<NotificationPayload>("nypsi:dms", {
  redis: redis,
  removeOnFailure: true,
  removeOnSuccess: true,
});

let connectingTimeout: NodeJS.Timeout;

dmQueueHandler.on("error", (err) => {
  logger.error(`bee queue error: ${err.message}`, err);

  if (err.message.includes("connection lost")) {
    if (connectingTimeout) return;
    connectingTimeout = setTimeout(async () => {
      await dmQueueHandler.connect();
      connectingTimeout = undefined;
    }, 30000);
  }
});

dmQueueHandler.on("ready", () => {
  logger.info("bee queue: DM queue handler ready");
});

dmQueueHandler.on("failed", (job, err) => {
  logger.error(`bee queue: DM ${job.data.memberId} failed: ${err.message}`, err);
});

dmQueueHandler.on("stalled", (jobId) => {
  logger.warn(`bee queue: DM ${jobId} stalled`);
});

dmQueueHandler.on("retrying", (job) => {
  logger.info(`bee queue: DM ${job.data.memberId} retrying`);
});

export function handleDmQueue(manager: ClusterManager) {
  dmQueueHandler.process(3, async (job) => {
    return await requestDM({
      client: manager,
      content: job.data.payload.content,
      memberId: job.data.memberId,
      components: job.data.payload.components,
      embed: job.data.payload.embed,
    });
  });
}

interface RequestDMOptions {
  memberId: string;
  content: string;
  embed?: CustomEmbed;
  client: NypsiClient | ClusterManager;
  components?: ActionRowBuilder<MessageActionRowComponentBuilder>;
}

async function requestDM(options: RequestDMOptions): Promise<boolean> {
  logger.info(`DM requested: ${options.memberId}`);

  try {
    if (await isUserBlacklisted(options.memberId)) {
      logger.info(`${options.memberId} is blacklisted`);
      return false;
    }
  } catch {
    logger.error(`failed blacklist check: ${options.memberId}`);
    return false;
  }

  if (options.client instanceof NypsiClient) {
    let clusterHas: (number | "not-found")[];
    let shard: number;

    try {
      clusterHas = await options.client.cluster.broadcastEval(
        async (c, { userId }) => {
          const client = c as unknown as NypsiClient;
          const user = await client.users.fetch(userId).catch(() => {});

          if (user) {
            return client.cluster.id;
          } else {
            return "not-found";
          }
        },
        {
          context: { userId: options.memberId },
        },
      );

      for (const i of clusterHas) {
        if (i != "not-found") {
          shard = i;
          break;
        }
      }
    } catch {
      logger.error(`failed finding member/shard: ${options.memberId}`);
    }

    if (isNaN(shard)) {
      logger.warn(`user not found: ${options.memberId}`);
      return false;
    }

    const payload: BaseMessageOptions = {
      content: options.content,
    };

    if (options.embed) {
      try {
        payload.embeds = [options.embed.toJSON()];
      } catch {
        payload.embeds = [options.embed as APIEmbed];
      }
    }

    if (options.components) {
      try {
        payload.components = [options.components.toJSON()];
      } catch {
        payload.components = [options.components];
      }
    }

    try {
      const res: ({ success: true } | { success: false; reason: string })[] =
        await options.client.cluster.broadcastEval(
          async (c, { needed, memberId, payload }) => {
            const client = c as unknown as NypsiClient;
            if (client.cluster.id != needed) return { success: false, reason: "wrong cluster" };

            const user = await client.users.fetch(memberId).catch(() => {});

            if (!user) return { success: false, reason: "user not found" };

            let fail = false;

            await user.send(payload as MessagePayload).catch(() => {
              fail = true;
            });

            if (fail) {
              return { success: false, reason: "failed to send" };
            }
            return { success: true };
          },
          {
            context: {
              needed: shard,
              memberId: options.memberId,
              payload: payload,
            },
          },
        );

      if (res.filter((i) => i.success)) {
        logger.info(`::success DM sent: ${options.memberId} (${shard})`);
        return true;
      } else {
        logger.warn(`failed to send DM: ${options.memberId}`, { results: res });
        return false;
      }
    } catch {
      logger.error(`failed to send DM: ${options.memberId} (caught)`);
    }
  } else {
    let clusterHas: (number | "not-found")[];
    let shard: number;

    try {
      clusterHas = await options.client.broadcastEval(
        async (c, { userId }) => {
          const client = c as unknown as NypsiClient;
          const user = await client.users.fetch(userId).catch(() => {});

          if (user) {
            return client.cluster.id;
          } else {
            return "not-found";
          }
        },
        {
          context: { userId: options.memberId },
        },
      );

      for (const i of clusterHas) {
        if (i != "not-found") {
          shard = i;
          break;
        }
      }

      if (isNaN(shard)) {
        logger.warn(`user not found: ${options.memberId}`);
        return false;
      }
    } catch {
      logger.error(`failed finding user/shard: ${options.memberId}`);
    }

    const payload: BaseMessageOptions = {
      content: options.content,
    };

    if (options.embed) {
      try {
        payload.embeds = [options.embed.toJSON()];
      } catch {
        payload.embeds = [options.embed as APIEmbed];
      }
    }

    if (options.components) {
      try {
        payload.components = [options.components.toJSON()];
      } catch {
        payload.components = [options.components];
      }
    }

    try {
      const res: ({ success: true } | { success: false; reason: string })[] =
        await options.client.broadcastEval(
          async (c, { needed, memberId, payload }) => {
            const client = c as unknown as NypsiClient;
            if (client.cluster.id != needed) return { success: false, reason: "wrong cluster" };

            const user = await client.users.fetch(memberId).catch(() => {});

            if (!user) return { success: false, reason: "user not found" };

            let fail = false;

            await user.send(payload as MessagePayload).catch(() => {
              fail = true;
            });

            if (fail) {
              return { success: false, reason: "failed to send" };
            }
            return { success: true };
          },
          {
            context: {
              needed: shard,
              memberId: options.memberId,
              payload: payload,
            },
          },
        );

      if (res.filter((i) => i.success)) {
        logger.info(`::success DM sent: ${options.memberId} (${shard})`);
        return true;
      } else {
        logger.warn(`failed to send DM: ${options.memberId}`, { results: res });
        return false;
      }
    } catch {
      logger.error(`failed to send DM: ${options.memberId} (caught)`);
    }
  }

  return false;
}

async function checkVoteReminder(userId: string) {
  const dmSettings = await getDmSettings(userId);

  if (dmSettings.voteReminder) {
    dmSettings.voteReminder = false;
    await updateDmSettings(userId, dmSettings);
  }
}
