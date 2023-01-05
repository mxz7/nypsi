import { ClusterClient, DjsClient } from "discord-hybrid-sharding";
import { Client, ClientOptions } from "discord.js";
import channelCreate from "../events/channelCreate";
import channelDelete from "../events/channelDelete";
import channelUpdate from "../events/channelUpdate";
import emojiCreate from "../events/emojiCreate";
import emojiDelete from "../events/emojiDelete";
import emojiUpdate from "../events/emojiUpdate";
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
import ready from "../events/ready";
import roleDelete from "../events/roleDelete";
import userUpdate from "../events/userUpdate";
import redis from "../init/redis";
import { runAuctionChecks } from "../scheduled/clusterjobs/checkauctions";
import { updateCounters } from "../scheduled/clusterjobs/counters";
import { runCraftItemsJob } from "../scheduled/clusterjobs/crafted";
import { runLotteryInterval } from "../scheduled/clusterjobs/lottery";
import { runLogs, runModerationChecks } from "../scheduled/clusterjobs/moderationchecks";
import { runNetWorthInterval } from "../scheduled/clusterjobs/networth-update";
import { runPremiumChecks } from "../scheduled/clusterjobs/premiumexpire";
import { runPremiumCrateInterval } from "../scheduled/clusterjobs/weeklycrates";
import { runWorkerInterval } from "../scheduled/clusterjobs/workers";
import Constants from "../utils/Constants";
import { doChatReactions } from "../utils/functions/chatreactions/utils";
import { runEconomySetup } from "../utils/functions/economy/utils";
import { runChristmas } from "../utils/functions/guilds/christmas";
import { runCountdowns } from "../utils/functions/guilds/countdowns";
import { runSnipeClearIntervals } from "../utils/functions/guilds/utils";
import { runUploadReset } from "../utils/functions/image";
import { startAutoMuteViolationInterval } from "../utils/functions/moderation/mute";
import { getCustomPresence } from "../utils/functions/presence";
import { getVersion } from "../utils/functions/version";
import { runCommandUseTimers } from "../utils/handlers/commandhandler";
import { updateCache } from "../utils/handlers/imghandler";
import { getWebhooks, logger, setClusterId } from "../utils/logger";

export class NypsiClient extends Client {
  public cluster: ClusterClient;

  constructor(options: ClientOptions) {
    super(options);

    this.cluster = new ClusterClient(this as unknown as DjsClient);

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

    this.once("ready", ready.bind(null, this));

    this.cluster.on("message", (message: any) => {
      if (message._type) {
        if (message.alive) message.reply({ alive: true });
      }
    });

    this.cluster.once("ready", async () => {
      await redis.del(Constants.redis.nypsi.RESTART);
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

      setTimeout(async () => {
        this.runIntervals();

        const presence = await getCustomPresence();

        if (presence) {
          if (presence.split(" ")[0].startsWith("https://www.youtube.com")) {
            this.cluster.broadcastEval(
              (c, { presence }) => {
                const url = presence.shift();
                c.user.setPresence({
                  activities: [
                    {
                      type: 1,
                      url: url,
                      name: presence.join(" "),
                    },
                  ],
                });
              },
              { context: { presence: presence.split(" ") } }
            );
          } else {
            this.cluster.broadcastEval(
              (c, { args }) => {
                c.user.setPresence({
                  activities: [
                    {
                      type: 0,
                      name: args.join(" "),
                    },
                  ],
                });
              },
              { context: { args: presence.split(" ") } }
            );
          }
        }
      }, 60000);
    });
  }

  private runIntervals() {
    updateCache();
    getWebhooks(this);
    runSnipeClearIntervals();
    doChatReactions(this);
    runCommandUseTimers(this);
    runUploadReset();
    startAutoMuteViolationInterval();

    if (this.cluster.id != 0) return;

    runLotteryInterval(this);
    runPremiumCrateInterval(this);
    runPremiumChecks(this);
    runModerationChecks(this);
    runAuctionChecks(this);
    runCountdowns(this);
    runChristmas(this);
    updateCounters(this);
    runLogs();
    runWorkerInterval();
    runNetWorthInterval();
    runCraftItemsJob();
  }
}
