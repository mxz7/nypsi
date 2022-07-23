import * as Cluster from "discord-hybrid-sharding";
import { Client, ClientOptions } from "discord.js";
import { doChatReactions } from "../chatreactions/utils";
import { runEconomySetup } from "../economy/utils";
import { runChristmas, runCountdowns, runSnipeClearIntervals, updateCounters } from "../guilds/utils";
import { updateCache } from "../imghandler";
import { getWebhooks, setClusterId } from "../logger";
import { runLotteryInterval } from "../scheduled/clusterjobs/lottery";
import { runModerationChecks } from "../scheduled/clusterjobs/moderationchecks";
import { runPremiumChecks } from "../scheduled/clusterjobs/premiumexpire";

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
        updateCounters(this);
        runCountdowns(this);
        runChristmas(this);
        runSnipeClearIntervals();
        doChatReactions(this);

        if (!this.shard.ids.includes(0)) return;

        runLotteryInterval(this);
        runPremiumChecks(this);
        runModerationChecks(this);
    }
}
