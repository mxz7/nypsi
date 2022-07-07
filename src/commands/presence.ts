import { CommandInteraction, Message } from "discord.js";
import { setCustomPresence } from "../utils/functions/presence";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";

const cmd = new Command("presence", "set custom a presence for nypsi", Categories.NONE);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (message.author.id != "672793821850894347") return;

    if (args.length == 0) {
        setCustomPresence("");
    } else {
        setCustomPresence(args.join(" "));

        message.client.user.setPresence({
            activities: [
                {
                    name: args.join(" "),
                },
            ],
        });
    }
}

cmd.setRun(run);

module.exports = cmd;
