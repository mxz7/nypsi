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
import guildUpdate from "../events/guildUpdate";
import interactionCreate from "../events/interactionCreate";
import messageCreate from "../events/message";
import messageDelete from "../events/messageDelete";
import messageDeleteBulk from "../events/messageDeleteBulk";
import messageUpdate from "../events/messageUpdate";
import roleDelete from "../events/roleDelete";
import userUpdate from "../events/userUpdate";
import redis from "../init/redis";
import { runBirthdays } from "../scheduled/clusterjobs/birthdays";
import { runLogs, runModerationChecks } from "../scheduled/clusterjobs/moderationchecks";
import startRandomDrops from "../scheduled/clusterjobs/random-drops";
import Constants from "../utils/Constants";
import { doChatReactions } from "../utils/functions/chatreactions/utils";
import { initCrashGame } from "../utils/functions/economy/crash";
import { runEconomySetup } from "../utils/functions/economy/utils";
import { runChristmas } from "../utils/functions/guilds/christmas";
import { runCountdowns } from "../utils/functions/guilds/countdowns";
import { runSnipeClearIntervals } from "../utils/functions/guilds/utils";
import { openKarmaShop } from "../utils/functions/karma/karmashop";
import { getCustomPresence, randomPresence, setCustomPresence } from "../utils/functions/presence";
import { runCommandUseTimers } from "../utils/handlers/commandhandler";
import { getWebhooks, logger, setClusterId } from "../utils/logger";
import ms = require("ms");

export class NypsiClient extends Client {
  public cluster: ClusterClient<Client>;
  private ready = false;

  constructor(options: ClientOptions) {
    super(options);

    this.cluster = new ClusterClient(this);

    setClusterId(this.cluster.id.toString());
    process.title = `nypsi: cluster ${this.cluster.id}`;

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
      redis.del(`${Constants.redis.nypsi.RESTART}:${this.cluster.id}`, "nypsi:users:playing");
      logger.debug("deleted redis playing key");
      this.on("guildCreate", guildCreate.bind(null, this));
      logger.debug("guild create event loaded");
      this.on("guildDelete", guildDelete.bind(null, this));
      logger.debug("guild delete event loaded");
      this.rest.on("rateLimited", (rate) => {
        logger.warn("rate limit: " + rate.url);
      });
      logger.debug("rest rate limit event loaded");
      this.on("guildMemberUpdate", guildMemberUpdate.bind(null));
      logger.debug("guild member update event loaded");
      this.on("guildMemberAdd", guildMemberAdd.bind(null));
      logger.debug("guild member add event loaded");
      this.on("guildMemberRemove", guildMemberRemove.bind(null));
      logger.debug("guild member remove event loaded");
      this.on("messageDelete", messageDelete.bind(null));
      logger.debug("message delete event loaded");
      this.on("messageUpdate", messageUpdate.bind(null));
      logger.debug("message update event loaded");
      this.on("messageCreate", messageCreate.bind(null));
      logger.debug("message create event loaded");
      this.on("messageDeleteBulk", messageDeleteBulk.bind(null));
      logger.debug("message delete bulk event loaded");
      this.on("channelCreate", channelCreate.bind(null));
      logger.debug("channel create event loaded");
      this.on("channelDelete", channelDelete.bind(null));
      logger.debug("channel delete event loaded");
      this.on("roleDelete", roleDelete.bind(null));
      logger.debug("role delete event loaded");
      this.on("userUpdate", userUpdate.bind(null));
      logger.debug("user update event loaded");
      this.on("interactionCreate", interactionCreate.bind(null));
      logger.debug("interaction create event loaded");
      this.on("channelUpdate", channelUpdate.bind(null));
      logger.debug("channel update event loaded");
      this.on("emojiCreate", emojiCreate.bind(null));
      logger.debug("emoji create event loaded");
      this.on("emojiDelete", emojiDelete.bind(null));
      logger.debug("emoji delete event loaded");
      this.on("emojiUpdate", emojiUpdate.bind(null));
      logger.debug("emoji update event loaded");
      this.on("entitlementCreate", entitlementCreate.bind(null));
      logger.debug("entitlement create event loaded");
      this.on("entitlementUpdate", entitlementUpdate.bind(null));
      logger.debug("entitlement update event loaded");
      this.on("entitlementDelete", entitlementDelete.bind(null));
      logger.debug("entitlement delete event loaded");
      this.on("guildUpdate", guildUpdate.bind(null));
      logger.debug("guild update event loaded");

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
              responsive: this.ready,
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
      logger.debug("cluster message event loaded");

      logger.info("listeners loaded");

      setTimeout(async () => {
        this.runIntervals();
      }, 60000);

      setInterval(async () => {
        if (await redis.exists("nypsi:maintenance")) return;
        if (await getCustomPresence()) return;
        const presence = await randomPresence();

        this.user.setPresence({
          status: "online",
          activities: [presence],
        });
      }, ms("15 minutes"));

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
    runBirthdays(this);

    if (this.channels.cache.get(Constants.CRASH_CHANNEL) && this.user.id === "678711738845102087")
      initCrashGame(this);

    if (this.cluster.id != 0) return;

    runModerationChecks(this);
    runCountdowns(this);
    runChristmas(this);
    openKarmaShop(this);
    startRandomDrops(this);
    runLogs();
  }
}
