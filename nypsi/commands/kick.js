/*jshint esversion: 8 */
module.exports = {
    name: "kick",
    description: "generic kick command",
    run: async (message, args) => {


        if (message.member.hasPermission("KICK_MEMBERS")) {

            if (!message.guild.me.hasPermission("KICK_MEMBERS")) {
                return message.channel.send("❌ \ni am lacking permission: 'KICK_MEMBERS'");
            }

            if (message.mentions.members.first() == null) {
                message.channel.send("❌ \n$kick @user (reason)");
                return;
            }

            let member = message.mentions.members.first();
            
            args.shift();
            
            member.kick(args.join(" ")).then((member) => {
                message.channel.send("👋 **" + member.user + "**");
                console.log(member.user.tag + " was kicked by " + message.member.user.tag);
            }).catch(() => {
                message.channel.send("❌ \ni'm unable to kick this user");
            });
        } else {
            message.channel.send("❌ \nyou are lacking permission: 'KICK_MEMBERS'");
        }


    }
};