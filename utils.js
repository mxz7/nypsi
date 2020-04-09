const fs = require("fs");
let users = JSON.parse(fs.readFileSync("./economy/users.json"));
const multiplier = JSON.parse(fs.readFileSync("./economy/slotsmulti.json"))
const isImageUrl = require('is-image-url');
const fetch = require("node-fetch")


const pornCache = new Map()
const bdsmCache = new Map()
const thighsCache = new Map()

const bdsmLinks = ["https://www.reddit.com/r/bdsm.json?sort=top&t=day", "https://www.reddit.com/r/bondage.json?sort=top&t=day", "https://www.reddit.com/r/dominated.json?sort=top&t=day"]
const thighsLinks = ["https://www.reddit.com/r/legs.json?sort=top&t=day",
    "https://www.reddit.com/r/thickthighs.json?sort=top&t=day",
    "https://www.reddit.com/r/perfectthighs.json?sort=top&t=day",
    "https://www.reddit.com/r/thighs.json?sort=top&t=day"]
const pornLinks = ["https://www.reddit.com/r/collegesluts.json?sort=top&t=day", 
    "https://www.reddit.com/r/realgirls.json?sort=top&t=day", 
    "https://www.reddit.com/r/legalteens.json?sort=top&t=day",
    "https://www.reddit.com/r/amateur.json?sort=top&t=day",
    "https://www.reddit.com/r/nsfw_snapchat.json?sort=top&t=day",
    "https://www.reddit.com/r/wet.json?sort=top&t=day",
    "https://www.reddit.com/r/bathing.json?sort=top&t=day",
    "https://www.reddit.com/r/nsfw_gif.json?sort=top&t=day",
    "https://www.reddit.com/r/nsfw_gifs.json?sort=top&t=day",
    "https://www.reddit.com/r/porngifs.json?sort=top&t=day",
    "https://www.reddit.com/r/gonewild.json?sort=top&t=day",
    "https://www.reddit.com/r/gonewild18.json?sort=top&t=day",
    "https://www.reddit.com/r/collegeamateurs.json?sort=top&t=day",
    "https://www.reddit.com/r/irlgirls.json?sort=top&t=day",
    "https://www.reddit.com/r/camwhores.json?sort=top&t=day",
    "https://www.reddit.com/r/camsluts.json?sort=top&t=day",
    "https://www.reddit.com/r/cumsluts.json?sort=top&t=day",
    "https://www.reddit.com/r/girlsfinishingthejob.json?sort=top&t=day",
    "https://www.reddit.com/r/cumfetish.json?sort=top&t=day",
    "https://www.reddit.com/r/creampies.json?sort=top&t=day",
    "https://www.reddit.com/r/throatpies.json?sort=top&t=day"]


setTimeout( async () => {
    //BDSM CACHE
    for (link of bdsmLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            bdsmCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    console.log("\x1b[32m[" + getTimestamp() + "] bdsm cache loaded\x1b[37m")

    //THIGHS CACHE
    for (link of thighsLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            thighsCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    console.log("\x1b[32m[" + getTimestamp() + "] thigh cache loaded\x1b[37m")

    //PORN CACHE
    for (link of pornLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            pornCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    console.log("\x1b[32m[" + getTimestamp() + "] porn cache loaded\x1b[37m")
}, 5000)

setInterval( async () => {
    console.log("\x1b[32m[" + getTimestamp() + "] nsfw cache updating..\x1b[37m")

    //BDSM CACHE
    for (link of bdsmLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            bdsmCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    console.log("\x1b[32m[" + getTimestamp() + "] bdsm cache updated\x1b[37m")

    //THIGHS CACHE
    for (link of thighsLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            thighsCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    console.log("\x1b[32m[" + getTimestamp() + "] thigh cache updated\x1b[37m")

    //PORN CACHE
    for (link of pornLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            pornCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    console.log("\x1b[32m[" + getTimestamp() + "] porn cache updated\x1b[37m")

    console.log("\x1b[32m[" + getTimestamp() + "] nsfw cache update finished\x1b[37m")
}, 21600000)

module.exports = {

    bdsmCache,
    thighsCache,
    pornCache,

    getColor: function(member) {
        if (member.displayHexColor == "#000000") {
           return "#d3d160";
        } else {
            return member.displayHexColor;
        }
    },

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
    
    formatDate: function(date) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Intl.DateTimeFormat("en-US", options).format(date);
    }   
};

function getTimestamp() {
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