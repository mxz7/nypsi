/*jshint esversion: 8 */
const { RichEmbed } = require("discord.js");

module.exports = {
    name: "github",
    description: "view code for the bot on github",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
        }

        let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

        const embed = new RichEmbed()
            .setColor(color)
            .setTitle("github")
            .setURL("https://github.com/tekohxd/nypsi")
            .setDescription(message.member + "\nthis bot is opensource and you can view/use the code for completely free\n" +
            "click the [here](https://github.com/tekohxd/nypsi) to view the source code on github")
            
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
            .setTimestamp();
        

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }
};