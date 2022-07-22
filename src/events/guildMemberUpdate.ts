import { GuildMember } from "discord.js";
import { addKarma } from "../utils/karma/utils";
import { addMember, getTier, isPremium, renewUser, setExpireDate, setTier } from "../utils/premium/utils";
import { createProfile, hasProfile } from "../utils/users/utils";

export default async function guildMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
    if (newMember.guild.id == "747056029795221513") {
        if (oldMember.roles.cache.size < newMember.roles.cache.size) {
            let tier = 0;

            // 747066190530347089 boost role
            // 819870727834566696 silver role
            // 819870846536646666 gold role
            // 819870959325413387 platinum role

            if (newMember.roles.cache.find((r) => r.id == "819870959325413387")) {
                // platinum
                tier = 4;
            } else if (newMember.roles.cache.find((r) => r.id == "819870846536646666")) {
                // gold
                tier = 3;
            } else if (newMember.roles.cache.find((r) => r.id == "747066190530347089")) {
                // boost
                tier = 2;
            } else if (newMember.roles.cache.find((r) => r.id == "819870727834566696")) {
                // silver
                tier = 2;
            } else if (newMember.roles.cache.find((r) => r.id == "819870590718181391")) {
                // bronze
                tier = 1;
            }

            if (tier == 0 || tier > 4) return;

            if (await isPremium(newMember.user.id)) {
                if (tier <= (await getTier(newMember.user.id))) return;

                await setTier(newMember.user.id, tier);
                await renewUser(newMember.user.id);
            } else {
                if (!(await hasProfile(newMember.user.id))) await createProfile(newMember.user);
                await addMember(newMember.user.id, tier);
                await addKarma(newMember.user.id, 50);
            }
        } else if (oldMember.roles.cache.size > newMember.roles.cache.size) {
            // 747066190530347089 boost role
            // 819870727834566696 silver role
            // 819870846536646666 gold role
            // 819870959325413387 platinum role
            if (
                oldMember.roles.cache.find((r) => r.id == "747066190530347089") &&
                !newMember.roles.cache.find((r) => r.id == "747066190530347089")
            ) {
                if (newMember.roles.cache.find((r) => r.id == "819870959325413387")) return;
                if (newMember.roles.cache.find((r) => r.id == "819870846536646666")) return;
                if (newMember.roles.cache.find((r) => r.id == "819870727834566696"))
                    setExpireDate(newMember.id, new Date(0));
            }
        }
    }
}
