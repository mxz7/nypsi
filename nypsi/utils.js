/*jshint esversion: 8 */
const { wholesome } = require("./config.json");


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
    
    formatDate: function(date) {
        var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return new Intl.DateTimeFormat("en-US", options).format(date);
    },

    wholesomeImg: function() {
        return wholesome[Math.floor(Math.random() * wholesome.length)];
    }
};
