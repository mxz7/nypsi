import { Role } from "discord.js";
import { getMuteRole, setMuteRole } from "../utils/functions/moderation/mute";

export default async function roleDelete(role: Role) {
  if ((await getMuteRole(role.guild)) == role.id) {
    await setMuteRole(role.guild, "");
  }
}
