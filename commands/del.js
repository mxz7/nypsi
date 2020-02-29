/*jshint esversion: 8 */

var cooldown = new Set();

module.exports = {
    name: "del",
    description: "bulk delete/purge messages",
    category: "fun",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ \nyou are lacking permission: 'MANAGE_MESSAGES'");  
        } 

        if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send("❌ \ni am lacking permission: 'MANAGE_MESSAGES'");
        }

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(2500));
        }

        if (isNaN(args[0]) || parseInt(args[0]) <= 0) {
            return message.channel.send("❌\n$del <amount>");
        }

        let amount = (parseInt(args[0]) + 1);

        if (!message.member.hasPermission("ADMINISTRATOR")) {
            amount = 15;
            cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 20000);
        }

        if (amount <= 100) {
            message.channel.bulkDelete(amount).then( () => {
                message.channel.send("✅\n**successfully deleted " + args[0] + " messages**").then(m => m.delete(2500));
            }).catch();
        } else {
            let amount1 = Math.round(amount / 100);

            if (amount1 > 10) {
                amount1 = 10;
            }

            for (var i = 0; i < amount1; i++) {
                if (amount < 100) {
                    message.channel.bulkDelete(amount).then( () => {
                        message.channel.send("✅\n**successfully deleted " + args[0] + " messages**").then(m => m.delete(10000));
                    });
                }
                message.channel.bulkDelete(100);
                amount -= 100;
            }

        }
    }
};