const ascii = require("figlet");
const { list } = require("../optout.json");

module.exports = {
    name: "ascii",
    description: "create ascii text",
    category: "fun",
    run: async (message, args) => {

        if (args.length == 0) {
            return message.channel.send("❌ you must include some text");
        }
        
        if (list.includes(message.member.user.id)) {
            return message.channel.send("❌ you have opted out of bot dms, use $optin to enable this command");
        }

        let lols = args.join(" ");

        let asciiString = "";

        ascii(lols, function(err, data) {
            if (!err) {
                asciiString = "```" + data + "```";
            }
        });

        if (asciiString.length >= 2000) {
            return message.channel.send("❌ ascii text exceeds discord message size");
        }

        message.member.send(asciiString).then( () => {
            return message.channel.send("✅\n**success - check your dms**");
        }).catch( () => {
            return message.channel.send("❌ unable to send you a dm");
        });

    }
};