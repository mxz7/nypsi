import { Client, ClientOptions } from "discord.js";
import * as Cluster from "discord-hybrid-sharding";
import { getWebhooks, setClusterId } from "../logger";
import { doChatReactions } from "../scheduled/clusterjobs/chatreaction";
import { runModerationChecks } from "../scheduled/clusterjobs/moderationchecks";
import { updateCache } from "../imghandler";
import { runLotteryInterval } from "../scheduled/clusterjobs/lottery";
import { runChristmas } from "../scheduled/clusterjobs/guildchristmas";
import { runPremiumChecks } from "../scheduled/clusterjobs/premiumexpire";
import { runEconomySetup } from "../economy/utils";
import { runCountdowns, updateCounters } from "../guilds/utils";

export class NypsiClient extends Client {
    public cluster: Cluster.Client;

    constructor(options: ClientOptions) {
        super(options);

        setClusterId(this.shard.ids[0]);

        runEconomySetup();

        return this;
    }

    public runIntervals() {
        updateCache();
        getWebhooks(this);
        runPremiumChecks();
        updateCounters(this);
        runCountdowns(this);

        if (!this.shard.ids.includes(0)) return;

        runLotteryInterval(this);

        runChristmas(this);
        runModerationChecks(this);
        doChatReactions(this);
    }
}
