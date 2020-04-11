const isImageUrl = require('is-image-url');
const fetch = require("node-fetch")

const pornCache = new Map()
const bdsmCache = new Map()
const assCache = new Map()
const thighsCache = new Map()

const bdsmLinks = ["https://www.reddit.com/r/bdsm.json?limit=777", "https://www.reddit.com/r/bondage.json?limit=777", "https://www.reddit.com/r/dominated.json?limit=777"]
const thighsLinks = ["https://www.reddit.com/r/legs.json?limit=777",
    "https://www.reddit.com/r/thickthighs.json?limit=777",
    "https://www.reddit.com/r/perfectthighs.json?limit=777",
    "https://www.reddit.com/r/thighs.json?limit=777"]
const assLinks = ["https://www.reddit.com/r/ass.json?limit=777",
    "https://www.reddit.com/r/asstastic.json?limit=777",
    "https://www.reddit.com/r/facedownassup.json?limit=777",
    "https://www.reddit.com/r/assinthong.json?limit=777",
    "https://www.reddit.com/r/buttplug.json?limit=777",
    "https://www.reddit.com/r/TheUnderbun.json?limit=777",
    "https://www.reddit.com/r/booty.json?limit=777",
    "https://www.reddit.com/r/HungryButts.json?limit=777",
    "https://www.reddit.com/r/whooties.json?limit=777"]
const pornLinks = ["https://www.reddit.com/r/collegesluts.json?limit=777", 
    "https://www.reddit.com/r/realgirls.json?limit=777", 
    "https://www.reddit.com/r/legalteens.json?limit=777",
    "https://www.reddit.com/r/amateur.json?limit=777",
    "https://www.reddit.com/r/nsfw_snapchat.json?limit=777",
    "https://www.reddit.com/r/wet.json?limit=777",
    "https://www.reddit.com/r/bathing.json?limit=777",
    "https://www.reddit.com/r/nsfw_gif.json?limit=777",
    "https://www.reddit.com/r/nsfw_gifs.json?limit=777",
    "https://www.reddit.com/r/porngifs.json?limit=777",
    "https://www.reddit.com/r/gonewild.json?limit=777",
    "https://www.reddit.com/r/gonewild18.json?limit=777",
    "https://www.reddit.com/r/collegeamateurs.json?limit=777",
    "https://www.reddit.com/r/irlgirls.json?limit=777",
    "https://www.reddit.com/r/camwhores.json?limit=777",
    "https://www.reddit.com/r/camsluts.json?limit=777",
    "https://www.reddit.com/r/cumsluts.json?limit=777",
    "https://www.reddit.com/r/girlsfinishingthejob.json?limit=777",
    "https://www.reddit.com/r/cumfetish.json?limit=777",
    "https://www.reddit.com/r/creampies.json?limit=777",
    "https://www.reddit.com/r/throatpies.json?limit=777"]


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
    exports.bdsmCache = bdsmCache

    //ASS CACHE
    for (link of assLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            assCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    console.log("\x1b[32m[" + getTimestamp() + "] ass cache loaded\x1b[37m")
    exports.assCache = assCache

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
    exports.thighsCache = thighsCache

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
    exports.pornCache = pornCache
}, 5000)

setInterval( async () => {
    bdsmCache.clear()
    assCache.clear()
    thighsCache.clear()
    pornCache.clear()
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
    exports.bdsmCache = bdsmCache

    //ASS CACHE
    for (link of assLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            assCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    console.log("\x1b[32m[" + getTimestamp() + "] ass cache updated\x1b[37m")
    exports.assCache = assCache

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
    exports.thighsCache = thighsCache

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
    exports.pornCache = pornCache

    console.log("\x1b[32m[" + getTimestamp() + "] nsfw cache update finished\x1b[37m")
}, 21600000)

module.exports = {

    bdsmCache,
    thighsCache,
    pornCache,
    assCache,

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