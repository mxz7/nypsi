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

type JobResponse = { success: true; cluster: number; user: { id: string; username: string } };

const connection = new Redis({ maxRetriesPerRequest: null });

export const dmQueueWorker = new Worker<NotificationPayload, JobResponse>(
  "dms",
  async (job) => {
    const res = await requestDM({
      content: job.data.payload.content,
      memberId: job.data.memberId,
      components: job.data.payload.components,
      embed: job.data.payload.embed,
      client: manager,
    });

    return { success: true, cluster: res.cluster, user: res.debug.user };
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
  logger.info("dm: queue error", { name: err.name, message: err.message });
});

dmQueueWorker.on("stalled", (jobId) => {
  logger.info(`dm: job stalled: ${jobId}`);
});

dmQueueWorker.on("completed", (job) => {
  logger.info(`::success dm: job completed: ${job.id} ${job.data.memberId}`, {
    cluster: job.returnvalue.cluster,
    user: job.returnvalue.user,
    payload: job.data.payload,
  });
});

dmQueueWorker.on("failed", (job, err) => {
  logger.error(`dm: job failed: ${job.id} ${job.data.memberId}`, {
    name: err.name,
    message: err.message,
    payload: job.data.payload,
  });
});

dmQueueWorker.on("active", (job) => {
  logger.info(`dm: job active: ${job.id} ${job.data.memberId}`);
});

dmQueueWorker.pause();

interface RequestDMOptions {
  memberId: string;
  content: string;
  embed?: CustomEmbed;
  client: ClusterManager;
  components?: ActionRowBuilder<MessageActionRowComponentBuilder>;
}

class NoClusterError extends Error {
  constructor(userId: string, stage: number) {
    super(
      `no cluster found for member ${userId}, user is probably unknown to nypsi. stage: ${stage}`,
    );
    this.name = "NoClusterError";
  }
}

class DMFailedError extends Error {
  constructor(userId: string, data?: any) {
    super(`failed to send DM to member ${userId}`);
    this.name = "DMFailedError";
    if (data) {
      this.message += "\n" + JSON.stringify(data);
    }
  }
}

class UserNotFoundError extends Error {
  constructor(userId: string, cluster: number) {
    super(`user ${userId} not found in selected cluster: ${cluster}`);
    this.name = "UserNotFoundError";
  }
}

async function requestDM(options: RequestDMOptions) {
  const cluster = await findCluster(options.client, options.memberId);

  if (typeof cluster !== "number") {
    throw new NoClusterError(options.memberId, 1);
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
      | { success: true; cluster: number; debug: { user: any } }
      | { success: false; reason: string; error?: any }
    )[] = await options.client.broadcastEval(
      async (c, { cluster, memberId, payload }) => {
        const client = c as unknown as NypsiClient;
        if (client.cluster.id != cluster)
          return { success: false, reason: "wrong cluster", cluster: client.cluster.id };

        const user = await client.users.fetch(memberId).catch(() => {});

        if (!user) return { success: false, reason: "user not found", cluster: client.cluster.id };

        let error: any;

        await user.send(payload as MessagePayload).catch((err) => {
          error = err;
        });

        if (error) {
          return { success: false, reason: "failed to send", error: error };
        }
        return { success: true, debug: { user: user.toJSON() }, cluster: client.cluster.id };
      },
      {
        context: {
          cluster,
          memberId: options.memberId,
          payload: payload,
        },
      },
    );

    if (res.some((i) => i.success)) {
      const user = res.find((i) => i.success === true)?.debug.user;
      return { success: true, cluster, debug: { user: { id: user.id, username: user.username } } };
    } else {
      if (
        res.filter((i) => i.success === false && i.reason === "wrong cluster").length === res.length
      ) {
        throw new NoClusterError(options.memberId, 2);
      } else {
        const actual = res.find((i) => i.success === false && i.reason !== "wrong cluster");
        if (actual.success === true) {
          throw new Error("this does not fucking happen lol i hate typescript");
        }

        if (actual.reason === "user not found") {
          throw new UserNotFoundError(options.memberId, cluster);
        }

        if (actual.reason === "failed to send") {
          throw new DMFailedError(options.memberId, actual.error);
        }
      }
    }
  } catch {
    throw new DMFailedError(options.memberId);
  }
}

async function findCluster(manager: ClusterManager, userId: string) {
  const clusterResponse = await manager.broadcastEval(
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
      context: { userId },
    },
  );

  for (const i of clusterResponse) {
    if (i != "not-found") {
      return i;
    }
  }

  return null;
}
