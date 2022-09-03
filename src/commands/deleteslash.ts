import { CommandInteraction, Message } from "discord.js";
import { deleteSlashCommands, deleteSlashCommandsFromGuild } from "../utils/commandhandler";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";

const cmd = new Command("deleteslash", "delete slash commands", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (message.member.user.id != "672793821850894347") return;

    if (args.length == 0) {
        await deleteSlashCommandsFromGuild(message.guild.id, message.client.user.id);

        if (!(message instanceof Message)) return;

        return await message.react("✅");
    } else if (args[0].toLowerCase() == "global") {
        await deleteSlashCommands(message.client.user.id);

        if (!(message instanceof Message)) return;

        return await message.react("✅");
    }
}

cmd.setRun(run);

module.exports = cmd;
