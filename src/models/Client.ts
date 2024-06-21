import { ClusterClient } from "discord-hybrid-sharding";
import { ActivityType, Client, ClientOptions } from "discord.js";
import channelCreate from "../events/channelCreate";
import channelDelete from "../events/channelDelete";
import channelUpdate from "../events/channelUpdate";
import emojiCreate from "../events/emojiCreate";
import emojiDelete from "../events/emojiDelete";
import emojiUpdate from "../events/emojiUpdate";
import entitlementCreate from "../events/entitlementCreate";
import entitlementDelete from "../events/entitlementDelete";
import entitlementUpdate from "../events/entitlementUpdate";
import guildCreate from "../events/guildCreate";
import guildDelete from "../events/guildDelete";
import guildMemberAdd from "../events/guildMemberAdd";
import guildMemberRemove from "../events/guildMemberRemove";
import guildMemberUpdate from "../events/guildMemberUpdate";
import interactionCreate from "../events/interactionCreate";
import messageCreate from "../events/message";
import messageDelete from "../events/messageDelete";
import messageDeleteBulk from "../events/messageDeleteBulk";
import messageUpdate from "../events/messageUpdate";
import roleDelete from "../events/roleDelete";
import userUpdate from "../events/userUpdate";
import redis from "../init/redis";
import { doAutosellSitrep } from "../scheduled/clusterjobs/autosell_status";
import { runAuctionChecks } from "../scheduled/clusterjobs/checkauctions";
import { updateCounters } from "../scheduled/clusterjobs/counters";
import { runCraftItemsJob } from "../scheduled/clusterjobs/crafted";
import { runLotteryInterval } from "../scheduled/clusterjobs/lottery";
import { runLogs, runModerationChecks } from "../scheduled/clusterjobs/moderationchecks";
import startRandomDrops from "../scheduled/clusterjobs/random-drops";

import { runPremiumCrateInterval } from "../scheduled/clusterjobs/weeklycrates";
import { runWorkerInterval } from "../scheduled/clusterjobs/workers";
import Constants from "../utils/Constants";
import { doChatReactions } from "../utils/functions/chatreactions/utils";
import { runEconomySetup } from "../utils/functions/economy/utils";
import { runChristmas } from "../utils/functions/guilds/christmas";
import { runCountdowns } from "../utils/functions/guilds/countdowns";
import { runSnipeClearIntervals } from "../utils/functions/guilds/utils";
import { openKarmaShop } from "../utils/functions/karma/karmashop";
import { startAutoMuteViolationInterval } from "../utils/functions/moderation/mute";
import { getCustomPresence, randomPresence, setCustomPresence } from "../utils/functions/presence";
import { getVersion } from "../utils/functions/version";
import { runCommandUseTimers } from "../utils/handlers/commandhandler";
import { getWebhooks, logger, setClusterId } from "../utils/logger";

export class NypsiClient extends Client {
  public cluster: ClusterClient<Client>;
  private ready = false;

  constructor(options: ClientOptions) {
    super(options);

    this.cluster = new ClusterClient(this);

    setClusterId(this.cluster.id);
    process.title = `nypsi v${getVersion()}: cluster ${this.cluster.id}`;

    runEconomySetup();

    if (this.cluster.maintenance) {
      logger.info(`started on maintenance mode with ${this.cluster.maintenance}`);
    }

    return this;
  }

  public loadEvents() {
    this.on("shardReady", (shardID) => {
      logger.info(`shard#${shardID} ready`);
    });
    this.on("shardDisconnect", (s, shardID) => {
      logger.info(`shard#${shardID} disconnected`);
    });
    this.on("shardError", (error1, shardID) => {
      logger.error(`shard#${shardID} error: ${error1}`);
    });
    this.on("shardReconnecting", (shardID) => {
      logger.info(`shard#${shardID} connecting`);
    });
    this.on("shardResume", (shardId) => {
      logger.info(`shard#${shardId} resume`);
    });

    this.cluster.on("message", (message: any) => {
      if (message._type) {
        if (message.alive) message.reply({ alive: true });
      }
    });

    this.cluster.on("ready", async () => {
      if (this.ready) {
        logger.error("ready event called but already ready");
        return;
      }
      this.ready = true;

      logger.info(`cluster ${this.cluster.id} ready`);
      await redis.del(`${Constants.redis.nypsi.RESTART}:${this.cluster.id}`, "nypsi:users:playing");
      this.on("guildCreate", guildCreate.bind(null, this));
      this.on("guildDelete", guildDelete.bind(null, this));
      this.rest.on("rateLimited", (rate) => {
        logger.warn("rate limit: " + rate.url);
      });
      this.on("guildMemberUpdate", guildMemberUpdate.bind(null));
      this.on("guildMemberAdd", guildMemberAdd.bind(null));
      this.on("guildMemberRemove", guildMemberRemove.bind(null));
      this.on("messageDelete", messageDelete.bind(null));
      this.on("messageUpdate", messageUpdate.bind(null));
      this.on("messageCreate", messageCreate.bind(null));
      this.on("messageDeleteBulk", messageDeleteBulk.bind(null));
      this.on("channelCreate", channelCreate.bind(null));
      this.on("channelDelete", channelDelete.bind(null));
      this.on("roleDelete", roleDelete.bind(null));
      this.on("userUpdate", userUpdate.bind(null));
      this.on("interactionCreate", interactionCreate.bind(null));
      this.on("channelUpdate", channelUpdate.bind(null));
      this.on("emojiCreate", emojiCreate.bind(null));
      this.on("emojiDelete", emojiDelete.bind(null));
      this.on("emojiUpdate", emojiUpdate.bind(null));
      this.on("entitlementCreate", entitlementCreate.bind(null));
      this.on("entitlementUpdate", entitlementUpdate.bind(null));
      this.on("entitlementDelete", entitlementDelete.bind(null));

      this.cluster.on("message", async (message: any) => {
        if (message._type) {
          if (message.responsive) {
            const guilds = this.guilds.cache.mapValues((i) => {
              return {
                id: i.id,
                shard: i.shardId,
              };
            });
            const shardStatus = ["idle", "connecting", "resuming", "ready"];
            const shards = this.ws.shards.mapValues((shard) => {
              return {
                id: shard.id,
                status: shardStatus[shard.status],
                ping: shard.ping,
                lastPing: shard.lastPingTimestamp,
              };
            });
            message.reply({
              responsive: true,
              guilds,
              shards,
              restarting: Boolean(
                await redis.exists(`${Constants.redis.nypsi.RESTART}:${this.cluster.id}`),
              ),
              uptime: this.uptime,
            });
          }
        }
      });

      setTimeout(async () => {
        this.runIntervals();
      }, 60000);

      setInterval(
        async () => {
          if (await redis.exists("nypsi:maintenance")) return;
          if (await getCustomPresence()) return;
          const presence = randomPresence();

          this.user.setPresence({
            status: "online",
            activities: [presence],
          });
        },
        30 * 60 * 1000,
      );

      await setCustomPresence();

      setTimeout(async () => {
        if (await redis.exists("nypsi:maintenance")) {
          this.user.setPresence({
            status: "idle",
            activities: [
              {
                type: 4,
                name: "boobies",
                state: "⚠️ maintenance",
              },
            ],
          });
          return;
        }
        this.user.setPresence({
          status: "online",
          activities: [
            {
              type: ActivityType.Custom,
              name: "nypsi.xyz",
            },
          ],
        });
      }, 10000);
    });
  }

  private runIntervals() {
    getWebhooks(this);
    runSnipeClearIntervals();
    doChatReactions(this);
    runCommandUseTimers(this);
    startAutoMuteViolationInterval();

    if (this.cluster.id != 0) return;

    runLotteryInterval(this);
    runPremiumCrateInterval(this);
    runModerationChecks(this);
    runAuctionChecks(this);
    runCountdowns(this);
    runChristmas(this);
    updateCounters(this);
    openKarmaShop(this);
    startRandomDrops(this);
    runLogs();
    runWorkerInterval();
    runCraftItemsJob();
    doAutosellSitrep();
  }
}
