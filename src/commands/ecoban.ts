import { CommandInteraction, Message } from "discord.js";
import { toggleBan } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";

const cmd = new Command("ecoban", "ban an account from eco", Categories.NONE);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (message.author.id != "672793821850894347") return;

    if (args.length == 0 || args[0].length != 18) {
        return message.channel.send({ content: "dumbass" });
    }

    await toggleBan(args[0]);

    if (!(message instanceof Message)) return;

    message.react("✅");
}

cmd.setRun(run);

module.exports = cmd;
