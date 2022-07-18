import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { getDMsEnabled, setDMsEnabled, userExists, createUser } from "../utils/economy/utils.js";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("dms", "enable/disable dms with the bot", Categories.INFO).setAliases([
    "optout",
    "optin",
    "stopmessagingme",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 15);

    if (!(await userExists(message.member))) await createUser(message.member);

    const current = await getDMsEnabled(message.member);

    let newValue;
    let embed;

    if (current) {
        newValue = false;
        embed = new CustomEmbed(message.member, "✅ you will no longer receive dms from nypsi");
    } else {
        newValue = true;
        embed = new CustomEmbed(message.member, "✅ you will now receive dms from nypsi");
    }

    await setDMsEnabled(message.member, newValue);

    return await message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
