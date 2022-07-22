import { Client, ClientOptions } from "discord.js";
import * as Cluster from "discord-hybrid-sharding";
import { getWebhooks, setClusterId } from "../logger";
import { doChatReactions } from "../scheduled/clusterjobs/chatreaction";
import { runModerationChecks } from "../scheduled/clusterjobs/moderationchecks";
import { updateCache } from "../imghandler";
// import { runPopularCommandsTimer } from "../commandhandler";
import { runLotteryInterval } from "../scheduled/clusterjobs/lottery";
import { runCountdowns } from "../scheduled/clusterjobs/guildcountdowns";
import { runChristmas } from "../scheduled/clusterjobs/guildchristmas";

export class NypsiClient extends Client {
    public cluster: Cluster.Client;

    constructor(options: ClientOptions) {
        super(options);

        setClusterId(this.shard.ids[0]);

        console.log("cluster id set");

        return this;
    }

    public runIntervals() {
        if (!this.shard.ids.includes(0)) return;

        runLotteryInterval(this);

        //runPopularCommandsTimer(this, "747056029795221513", ["823672263693041705", "912710094955892817"]);

        runCountdowns(this);
        runChristmas(this);
        runModerationChecks(this);
        doChatReactions(this);

        // runChecks();

        updateCache();

        getWebhooks(this);
    }
}
