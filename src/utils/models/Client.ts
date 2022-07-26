import * as Cluster from "discord-hybrid-sharding";
import { Client, ClientOptions } from "discord.js";
import channelCreate from "../../events/channelCreate";
import guildCreate from "../../events/guildCreate";
import guildDelete from "../../events/guildDelete";
import guildMemberAdd from "../../events/guildMemberAdd";
import guildMemberRemove from "../../events/guildMemberRemove";
import guildMemberUpdate from "../../events/guildMemberUpdate";
import interactionCreate from "../../events/interactionCreate";
import messageCreate from "../../events/message";
import messageDelete from "../../events/messageDelete";
import messageUpdate from "../../events/messageUpdate";
import ready from "../../events/ready";
import roleDelete from "../../events/roleDelete";
import userUpdate from "../../events/userUpdate";
import { doChatReactions } from "../chatreactions/utils";
import { runCommandUseTimers } from "../commandhandler";
import redis from "../database/redis";
import { runEconomySetup } from "../economy/utils";
import { runChristmas, runCountdowns, runSnipeClearIntervals, updateCounters } from "../guilds/utils";
import { updateCache } from "../imghandler";
import { getWebhooks, logger, setClusterId } from "../logger";
import { runLotteryInterval } from "../scheduled/clusterjobs/lottery";
import { runModerationChecks } from "../scheduled/clusterjobs/moderationchecks";
import { runPremiumChecks } from "../scheduled/clusterjobs/premiumexpire";
import { runPremiumCrateInterval } from "../scheduled/clusterjobs/weeklycrates";

export class NypsiClient extends Client {
    public cluster: Cluster.Client;

    constructor(options: ClientOptions) {
        super(options);

        this.cluster = new Cluster.Client(this);

        setClusterId(this.cluster.id);

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

        this.cluster.on("ready", async () => {
            await redis.del("nypsi:restarting");
            this.on("guildCreate", guildCreate.bind(null, this));
            this.on("guildDelete", guildDelete.bind(null, this));
            this.rest.on("rateLimited", (rate) => {
                const a = rate.route.split("/");
                const reason = a[a.length - 1];
                logger.warn("rate limit: " + reason);
            });
            this.on("guildMemberUpdate", guildMemberUpdate.bind(null));
            this.on("guildMemberAdd", guildMemberAdd.bind(null));
            this.on("guildMemberRemove", guildMemberRemove.bind(null));
            this.on("messageDelete", messageDelete.bind(null));
            this.on("messageUpdate", messageUpdate.bind(null));
            this.on("messageCreate", messageCreate.bind(null));
            this.on("channelCreate", channelCreate.bind(null));
            this.on("roleDelete", roleDelete.bind(null));
            this.on("userUpdate", userUpdate.bind(null));
            this.on("interactionCreate", interactionCreate.bind(null));

            setTimeout(() => {
                this.runIntervals();
            }, 5000);
        });
    }

    private runIntervals() {
        updateCache();
        getWebhooks(this);
        updateCounters(this);
        runCountdowns(this);
        runChristmas(this);
        runSnipeClearIntervals();
        doChatReactions(this);
        runCommandUseTimers(this);

        if (this.cluster.id != 0) return;

        runLotteryInterval(this);
        runPremiumCrateInterval(this);
        runPremiumChecks(this);
        runModerationChecks(this);
    }
}
