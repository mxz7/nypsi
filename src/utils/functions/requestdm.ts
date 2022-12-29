import { ClusterManager } from "discord-hybrid-sharding";
import {
  ActionRowBuilder,
  APIEmbed,
  BaseMessageOptions,
  MessageActionRowComponentBuilder,
  MessagePayload,
} from "discord.js";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { logger } from "../logger";
import { getDmSettings, updateDmSettings } from "./users/notifications";

interface RequestDMOptions {
  memberId: string;
  content: string;
  embed?: CustomEmbed;
  client: NypsiClient | ClusterManager;
  components?: ActionRowBuilder<MessageActionRowComponentBuilder>;
}

export default async function requestDM(options: RequestDMOptions): Promise<boolean> {
  logger.info(`DM requested: ${options.memberId}`);

  if (options.client instanceof NypsiClient) {
    const clusterHas = await options.client.cluster.broadcastEval(
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
      }
    );

    let shard: number;

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

    const res = await options.client.cluster.broadcastEval(
      async (c, { needed, memberId, payload }) => {
        const client = c as unknown as NypsiClient;
        if (client.cluster.id != needed) return false;

        const user = await client.users.fetch(memberId).catch(() => {});

        if (!user) return false;

        let fail = false;

        await user.send(payload as MessagePayload).catch(() => {
          fail = true;
        });

        if (fail) {
          return false;
        }
        return true;
      },
      {
        context: {
          needed: shard,
          memberId: options.memberId,
          payload: payload,
        },
      }
    );

    if (res.includes(true)) {
      logger.log({
        level: "success",
        message: `DM sent: ${options.memberId}`,
      });
      return true;
    } else {
      logger.warn(`failed to send DM: ${options.memberId}`);
      return false;
    }
  } else {
    const clusterHas = await options.client.broadcastEval(
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
      }
    );

    let shard: number;

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

    const res = await options.client.broadcastEval(
      async (c, { needed, memberId, payload }) => {
        const client = c as unknown as NypsiClient;
        if (client.cluster.id != needed) return false;

        const user = await client.users.fetch(memberId).catch(() => {});

        if (!user) return false;

        let fail = false;

        await user.send(payload as MessagePayload).catch(() => {
          fail = true;
        });

        if (fail) {
          return false;
        }
        return true;
      },
      {
        context: {
          needed: shard,
          memberId: options.memberId,
          payload: payload,
        },
      }
    );

    if (res.includes(true)) {
      logger.log({
        level: "success",
        message: `DM sent: ${options.memberId}`,
      });
      return true;
    } else {
      logger.warn(`failed to send DM: ${options.memberId}`);
      // await checkVoteReminder(options.memberId);
      return false;
    }
  }
}

async function checkVoteReminder(userId: string) {
  const dmSettings = await getDmSettings(userId);

  if (dmSettings.voteReminder) {
    dmSettings.voteReminder = false;
    await updateDmSettings(userId, dmSettings);
  }
}
