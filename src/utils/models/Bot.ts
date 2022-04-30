import { Client, ClientOptions } from "discord.js"
import { Command } from "./Command"

export default class Bot extends Client {
    public owners: Array<string>
    public staff: Array<string>
    public commands: Map<string, Command>

    constructor(options: ClientOptions) {
        super(options)

        this.owners = ["672793821850894347"]
        this.staff = ["672793821850894347"]
        this.commands = new Map()
    }

    public async loadCommands() {
        //TODO: FINISH
    }
}