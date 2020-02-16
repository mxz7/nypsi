/*jshint esversion: 8 */
module.exports = {
    name: "ban",
    category: "moderation",
    description: "kicks people",
    execute(message, args) {
        
        if (message.member.hasPermission("BAN_MEMBERS")) {

            if (!message.guild.me.hasPermission("BAN_MEMBERS")) {
                return message.reply("❌ \ni am lacking permission: 'BAN_MEMBERS'");
            }

            if (message.mentions.members.first() == null) {
                message.channel.send("❌\nproper usage: $ban @user (reason)");
                return;
            }
            let member = message.mentions.members.first();

            let reason;

            if (args.length == 2) {
                reason = "no reason provided";
            } else {
                args.shift();
                args.shift();
                reason = args.join(" ");
            }

            member.ban({
                reason: ("moderator: " + message.member.user.tag + " | | | reason: " + reason)
            }).then((member) => {
                message.channel.send("👋\n**" + member.user.tag + "was banned for** *" + reason + "*");
                console.log(member.user.tag + " was banned by " + message.member.tag.user + " for: " + reason);
            }).catch(() => {
                message.channel.send("❌ \ni'm unable to ban this user");
            });
        } else {
            message.channel.send("❌ \nyou are lacking permission: 'BAN_MEMBERS'");
        }

    }
};