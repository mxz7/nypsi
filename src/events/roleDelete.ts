import { Role } from "discord.js";
import { getMuteRole, profileExists, setMuteRole } from "../utils/moderation/utils";

export default async function roleDelete(role: Role) {
    if (!(await profileExists(role.guild))) return;

    if ((await getMuteRole(role.guild)) == role.id) {
        await setMuteRole(role.guild, "");
    }
}
