/*jshint esversion: 8 */
module.exports = {
    name: "del",
    description: "bulk delete/purge messages",
    run: async (message, args) => {

        if (message.member.hasPermission("MANAGE_MESSAGES")) {

            if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
                return message.channel.send("❌ \nyou are lacking permission: 'MANAGE_MESSAGES'");
            }

            if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
                return message.channel.send("❌\ninvalid number");
            }

            let amount = (parseInt(args[0]) + 1);

            if (amount > 100) {
                amount = 100;
            }

            message.channel.bulkDelete(amount).then(deleted => {
                message.channel.send("✅\n**successfully deleted " + (amount - 1) + " messages**").then(m => m.delete(2500));
                console.log("deleted " + amount + " by " + message.member.user.tag);
            }).catch();
        } else {
            message.channel.send("❌ \nyou are lacking permission: 'MANAGE_MESSAGES'");
        }
    }
};