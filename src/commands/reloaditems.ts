import { CommandInteraction, Message } from "discord.js";
import { loadItems } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";

const cmd = new Command("reloaditems", "reload items", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (message.member.user.id != "672793821850894347") return;

    loadItems();

    return (message as Message).react("");
}

cmd.setRun(run);

module.exports = cmd;
