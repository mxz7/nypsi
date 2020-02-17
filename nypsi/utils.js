/*jshint esversion: 8 */
module.exports = {
    getMember: function(message, args) {
        if (args.length == 1) {
            return message.member;
        }
    
        if (message.mentions.members.first()) {
            return message.mentions.members.first();
        }
    
        const target = message.guild.members.find(member => {
            return member.displayName.toLowerCase().includes(args[1]) || member.user.tag.toLowerCase().includes(args[1]);
        });
    
        return target;
    },
    
    formatDate: function(date) {
        var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return new Intl.DateTimeFormat("en-US", options).format(date);
    }
};
