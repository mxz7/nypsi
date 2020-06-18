const isImageUrl = require('is-image-url');
const fetch = require("node-fetch")

module.exports = {

    /**
     * @returns {string}
     * @param {*} member member to get color of
     */
    getColor: function(member) {
        if (member.displayHexColor == "#ffffff") {
           return "#f8f8ff";
        } else {
            return member.displayHexColor;
        }
    },

    /**
     * @returns {string}
     * @param post {JSON}
     * @param allowed {Array}
     */
    redditImage: async function(post, allowed)  {
        let image = post.data.url 

        if (image.includes("imgur.com/a/")) {
            post = allowed[Math.floor(Math.random() * allowed.length)]
            image = post.data.url
        }

        if (image.includes("imgur") && !image.includes("gif")) {
            image = "https://i.imgur.com/" + image.split("/")[3]
            if (!isImageUrl(image)) {
                image = "https://i.imgur.com/" + image.split("/")[3] + ".gif"
            }
            return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
        }

        if (image.includes("gfycat")) {

            const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(url => url.json())

            if (link.gfyItem) {
                image = link.gfyItem.max5mbGif
                return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
            }
        }

        let count = 0

        while (!isImageUrl(image)) {

            if (count >= 10) {
                console.log("couldnt find image @ " + post.data.subreddit_name_prefixed)
                return "lol"
            }

            count++

            post = allowed[Math.floor(Math.random() * allowed.length)]
            image = post.data.url

            if (image.includes("imgur.com/a/")) {
                post = allowed[Math.floor(Math.random() * allowed.length)]
                image = post.data.url
            }

            if (image.includes("imgur") && !image.includes("gif") && !image.includes("png")) {
                image = "https://i.imgur.com/" + image.split("/")[3]
                image = "https://i.imgur.com/" + image.split("/")[3] + ".png"
                if (!isImageUrl(image)) {
                    image = "https://i.imgur.com/" + image.split("/")[3] + ".gif"
                    return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
                }
            }
    
            if (image.includes("gfycat")) {
    
                const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(url => url.json())
    
                if (link) {
                    image = link.gfyItem.max5mbGif
                    return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
                }
            }
        }
        return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
    },

    /**
     * @returns {Object} member object
     * @param {*} message
     * @param {string} memberName name of member
     */
    getMember: function(message, memberName) {
        if (!message.guild) return null
        let target = message.guild.members.cache.find(member => {
            if (member.user.tag.slice(0, -5).toLowerCase() == memberName.toLowerCase()) {
                return member;
            }
        });

        if (!target) {
            target = message.guild.members.cache.find(member => {
                return member.displayName.toLowerCase().includes(memberName.toLowerCase()) || member.user.tag.toLowerCase().includes(memberName.toLowerCase());
            });
        }

        if (!target) {
            target = message.guild.members.cache.find(member => {
                return member.user.id == memberName;
            });
        }

        return target;
    },
    
    /**
     * @returns {string}
     * @param {Date} date 
     */
    formatDate: function(date) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Intl.DateTimeFormat("en-US", options).format(date);
    },

    /**
     * @returns {string}
     */
    getTimestamp: function() {
        const date = new Date();
        let hours = date.getHours().toString();
        let minutes = date.getMinutes().toString();
        let seconds = date.getSeconds().toString();
        
        if (hours.length == 1) {
            hours = "0" + hours;
        } 
        
        if (minutes.length == 1) {
            minutes = "0" + minutes;
        } 
        
        if (seconds.length == 1) {
            seconds = "0" + seconds;
        }
        
        const timestamp = hours + ":" + minutes + ":" + seconds;
    
        return timestamp
    }
};