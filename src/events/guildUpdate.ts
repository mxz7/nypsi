import { Guild } from "discord.js";
import { updateGuild } from "../utils/functions/guilds/utils";

export default async function guildUpdate(oldGuild: Guild, newGuild: Guild) {
  if (oldGuild.name !== newGuild.name || oldGuild.iconURL() !== newGuild.iconURL()) {
    await updateGuild(newGuild);
  }
}
