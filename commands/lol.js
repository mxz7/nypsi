const fetch = require("node-fetch")

module.exports = {
    name: "lol",
    description: "test",
    category: "none",
    run: async (message, args) => {

        const link = "https://www.reddit.com/r/bdsm.json?limit=777"

        const res = await fetch(link).then(a => a.json())

        const allowed = res.data.children.filter(post => !post.data.is_self)

        console.log(allowed)

    }
}