/*jshint esversion: 8 */
module.exports = {
    name: "ban",
    description: "generic ban command",
    category: "moderation",
    run: async (message, args) => {
        
        if (!message.member.hasPermission("BAN_MEMBERS")) {
            return message.channel.send("❌ \nyou are lacking permission: 'BAN_MEMBERS'");
        }

        if (!message.guild.me.hasPermission("BAN_MEMBERS")) {
            return message.channel.send("❌ \ni am lacking permission: 'BAN_MEMBERS'");
        }

        if (message.mentions.members.first() == null) {
            message.channel.send("❌\n$ban @user (reason)");
            return;
        }
        let member = message.mentions.members.first();

        let reason;

        if (args.length == 1) {
            reason = "no reason provided";
        } else {
            args.shift();
            reason = args.join(" ");
        }

        let banned = member.user.tag;

        member.ban({
            reason: ("moderator: " + message.member.user.tag + " | | | reason: " + reason)
        }).then(() => {
            message.channel.send("👋\n**" + banned + "was banned for** *" + reason + "*");
        }).catch(() => {
            message.channel.send("❌ \ni'm unable to ban this user");
        });

    }
};