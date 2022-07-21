import { Client, ClientOptions } from "discord.js";
import * as Cluster from "discord-hybrid-sharding";

export class NypsiClient extends Client {
    public cluster: Cluster.Client;

    constructor(options: ClientOptions) {
        super(options);

        this.cluster = new Cluster.Client(this);

        return this;
    }
}
