/*jshint esversion: 8 */
const { wholesome } = require("./images.json");


module.exports = {
    getMember: function(message, args) {
        if (args.length == 0) {
            return message.member;
        }
    
        if (message.mentions.members.first()) {
            return message.mentions.members.first();
        }
    
        const target = message.guild.members.find(member => {
            return member.displayName.toLowerCase().includes(args[0].toLowerCase()) || member.user.tag.toLowerCase().includes(args[0].toLowerCase());
        });
    
        return target;
    },

    getMember1: function(message, memberName) {
        const target = message.guild.members.find(member => {
            return member.displayName.toLowerCase().includes(memberName.toLowerCase()) || member.user.tag.toLowerCase().includes(memberName.toLowerCase());
        });
        return target;
    },
    
    formatDate: function(date) {
        var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return new Intl.DateTimeFormat("en-US", options).format(date);
    },

    wholesomeImg: function() {
        return wholesome[Math.floor(Math.random() * wholesome.length)];
    },

    getMention: function(message, memberMention) {
        if (!memberMention) return;

        if (memberMention.startsWith("<@") && memberMention.endsWith(">")) {
            memberMention = memberMention.slice(2, -1);
            if (memberMention.startsWith('!')) {
                memberMention = memberMention.slice(1);
            }

            return message.guild.members.get(memberMention);
        }
    }
};
