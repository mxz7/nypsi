import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { uploadGuildCommands, uploadGuildCommandsGlobal } from "../utils/commandhandler";

const cmd = new Command("reloadslash", "reload data for slash commands", Categories.NONE).setPermissions(["bot owner"]);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (message.member.user.id != "672793821850894347") return;

    if (args.length == 0) {
        await uploadGuildCommands(message.guild.id, message.client.user.id);

        if (!(message instanceof Message)) return;

        return await message.react("✅");
    } else if (args[0].toLowerCase() == "global") {
        await uploadGuildCommandsGlobal(message.client.user.id);

        if (!(message instanceof Message)) return;

        return await message.react("✅");
    }
}

cmd.setRun(run);

module.exports = cmd;
