/*jshint esversion: 8 */
const { wholesome } = require("./images.json");

module.exports = {
    getMember: function(message, memberName) {
        let target = message.guild.members.find(member => {
            if (member.user.tag.slice(0, -5).toLowerCase() == memberName.toLowerCase()) {
                return member;
            }
        });

        if (!target) {
            target = message.guild.members.find(member => {
                return member.displayName.toLowerCase().includes(memberName.toLowerCase()) || member.user.tag.toLowerCase().includes(memberName.toLowerCase());
            });
        }

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
