import { Worker } from "bullmq";
import { ClusterManager } from "discord-hybrid-sharding";
import {
  ActionRowBuilder,
  APIEmbed,
  BaseMessageOptions,
  MessageActionRowComponentBuilder,
  MessagePayload,
} from "discord.js";
import Redis from "ioredis";
import { manager } from "../..";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { NotificationPayload } from "../../types/Notification";
import { logger } from "../logger";

const connection = new Redis({ maxRetriesPerRequest: null });

export const dmQueueWorker = new Worker<NotificationPayload, boolean>(
  "dms",
  async (job) => {
    const res = await requestDM({
      content: job.data.payload.content,
      memberId: job.data.memberId,
      components: job.data.payload.components,
      embed: job.data.payload.embed,
      client: manager,
    });

    switch (res) {
      case "success":
        return true;
      case "failed":
        return false;
      case "error":
        throw new Error(`failed to dm ${job.data.memberId} after 3 attempts`);
    }
  },
  {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
    connection,
    concurrency: 3,
  },
);

dmQueueWorker.on("paused", () => {
  logger.info("dm: queue paused");
});

dmQueueWorker.on("resumed", () => {
  logger.info("dm: queue resumed");
});

dmQueueWorker.on("error", (err) => {
  logger.error("dm: queue error", err);
});

dmQueueWorker.on("stalled", (jobId) => {
  logger.debug(`dm: job stalled: ${jobId}`);
});

dmQueueWorker.on("completed", (job) => {
  logger.debug(`dm: job completed: ${job.id} ${job.data.memberId}`);
});

dmQueueWorker.on("failed", (job, err) => {
  logger.error(`dm: job failed: ${job.id} ${job.data.memberId}`, err);
});

dmQueueWorker.pause();

interface RequestDMOptions {
  memberId: string;
  content: string;
  embed?: CustomEmbed;
  client: NypsiClient | ClusterManager;
  components?: ActionRowBuilder<MessageActionRowComponentBuilder>;
}

async function requestDM(options: RequestDMOptions): Promise<"success" | "failed" | "error"> {
  logger.info(`dm: requested ${options.memberId}`);

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
      logger.error(`dm: failed finding member/shard: ${options.memberId}`);
      return "error";
    }

    if (isNaN(shard)) {
      logger.warn(`dm: user not found: ${options.memberId}`);
      return "failed";
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
      const res: (
        | { success: true; cluster: number; debug: any }
        | { success: false; reason: string }
      )[] = await options.client.cluster.broadcastEval(
        async (c, { needed, memberId, payload }) => {
          const client = c as unknown as NypsiClient;
          if (client.cluster.id != needed)
            return { success: false, reason: "wrong cluster", cluster: client.cluster.id };

          const user = await client.users.fetch(memberId).catch(() => {});

          if (!user)
            return { success: false, reason: "user not found", cluster: client.cluster.id };

          let fail = false;

          await user.send(payload as MessagePayload).catch(() => {
            fail = true;
          });

          if (fail) {
            return { success: false, reason: "failed to send", cluster: client.cluster.id };
          }
          return { success: true, cluster: client.cluster.id, debug: user.toJSON() };
        },
        {
          context: {
            needed: shard,
            memberId: options.memberId,
            payload: payload,
          },
        },
      );

      if (res.filter((i) => i.success).length > 0) {
        logger.info(`::success dm: sent ${options.memberId} (${shard})`, {
          debug: res.find((i) => i.success === true)?.debug,
        });
        return "success";
      } else {
        logger.warn(`dm: failed to send: ${options.memberId}`, { results: res });
        return "failed";
      }
    } catch {
      logger.error(`dm: failed to send: ${options.memberId} (caught)`);
      return "error";
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
        logger.warn(`dm: user not found: ${options.memberId}`);
        return "failed";
      }
    } catch {
      logger.error(`dm: failed finding user/shard: ${options.memberId}`);
      return "error";
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
            if (client.cluster.id != needed)
              return { success: false, reason: "wrong cluster", cluster: client.cluster.id };

            const user = await client.users.fetch(memberId).catch(() => {});

            if (!user)
              return { success: false, reason: "user not found", cluster: client.cluster.id };

            let fail = false;

            await user.send(payload as MessagePayload).catch(() => {
              fail = true;
            });

            if (fail) {
              return { success: false, reason: "failed to send", cluster: client.cluster.id };
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

      if (res.filter((i) => i.success).length > 0) {
        logger.info(`::success dm: sent ${options.memberId} (${shard})`);
        return "success";
      } else {
        logger.warn(`dm: failed to send: ${options.memberId}`, { results: res });
        return "failed";
      }
    } catch {
      logger.error(`dm: failed to send: ${options.memberId} (caught)`);
      return "error";
    }
  }
}
