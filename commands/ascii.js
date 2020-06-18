const ascii = require("figlet");
const { getColor } = require("../utils/utils.js")
const { MessageEmbed } = require("discord.js")
const { list } = require("../optout.json");

const cooldown = new Map()

module.exports = {
    name: "ascii",
    description: "create ascii text",
    category: "fun",
    run: async (message, args) => {

        if (list.includes(message.member.user.id)) {
            return message.channel.send("❌ you have opted out of bot dms, use $optin to enable this command");
        }

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 5 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        const color = getColor(message.member)

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("ascii help")
                .addField("usage", "$ascii hello\n$ascii hello | ghost\n$ascii <text> | <font>")
                .addField("help", "to view different fonts use $ascii fonts <page (1/2/3/4/5)>")
                .setColor(color)
                .setFooter("bot.tekoh.wtf")
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ you must include some text");
            })
        }


        if (args[0] == "fonts") {
            if (args.length == 1) {
                return message.channel.send("❌ $ascii fonts <page (1/2/3/4/5)>")
            } else if (args[1] == "1") {
                const embed = new MessageEmbed()
                    .setTitle("ascii fonts page 1")
                    .setDescription("`1Row`, `3-D`, `3D Diagonal`, `3D-ASCII`, `3x5`, `4Max`, `5 Line Oblique`, `AMC 3 Line`, `AMC 3 Liv1`, `AMC AAA01`, `AMC Neko`, `AMC Razor`, `AMC Razor2`, `AMC Slash`, `AMC Slider`, `AMC Thin`, `AMC Tubes`, `AMC Untitled`, `ANSI Shadow`, `ASCII New Roman`, `Acrobatic`, `Alligator`, `Alligator2`, `Alpha`, `Alphabet`, `Arrows`, `Avatar`, `B1FF`, `B1FF`, `Banner`, `Banner3-D`, `Banner3`, `Banner4`, `Barbwire`, `Basic`, `Bear`, `Bell`, `Benjamin`, `Big Chief`, `Big Money-ne`, `Big Money-nw`, `Big Money-se`, `Big Money-sw`, `Big`, `Bigfig`, `Binary`, `Block`, `Blocks`, `Bloody`, `Bolger`, `Braced`, `Bright`, `Broadway KB`, `Broadway`")
                    .setColor(color)
                    .setFooter("$ascii fonts 2 for next page")

                return message.channel.send(embed)
            } else if (args[1] == "2") {
                const embed = new MessageEmbed()
                    .setTitle("ascii fonts page 2")
                    .setDescription("`Bubble`, `Bulbhead`, `Caligraphy`, `Caligraphy2`, `Calvin S`, `Cards`, `Catwalk`, `Chiseled`, `Chunky`, `Coinstak`, `Cola`, `Colossal`, `Computer`, `Contessa`, `Contrast`, `Cosmike`, `Crawford`, `Crawford2`, `Crazy`, `Cricket`, `Cursive`, `Cyberlarge`, `Cybermedium`, `Cybersmall`, `Cygnet`, `DANC4`, `DOS Rebel`, `DWhistled`, `Dancing Font`, `Decimal`, `Def Leppard`, `Delta Corps Priest 1`, `Diamond`, `Diet Cola`, `Digital`, `Doh`, `Doom`, `Dot Matrix`, `Double Shorts`, `Double`, `Dr Pepper`, `Efti Chess`, `Efti Font`, `Efti Italic`, `Efti Piti`, `Efti Robot`")
                    .setColor(color)
                    .setFooter("$ascii fonts 3 for next page")

                return message.channel.send(embed)
            } else if (args[1] == "3") {
                const embed = new MessageEmbed()
                    .setTitle("ascii fonts page 3")
                    .setDescription("`Efti Wall`, `Efti Water`, `Electronic`, `Elite`, `Epic`, `Fender`, `Filter`, `Fire Font-k`, `Fire Font-s`, `Flipped`, `Flower Power`, `Four Tops`, `Fraktur`, `Fun Face`, `Fun Faces`, `Fuzzy`, `Georgi16`, `Georgia11`, `Ghost`, `Ghoulish`, `Glenyn`, `Goofy`, `Gothic`, `Graceful`, `Gradient`, `Graffiti`, `Greek`, `Heart Left`, `Heart Right`, `Henry 3D`, `Hex`, `Hieroglyphs`, `Hollywood`, `Horizontal Left`, `Horizontal Right`, `ICL-1900`, `Impossible`, `Invita`, `Isometric1`, `Isometric2`, `Isometric3`, `Isometric4`, `Italic`, `Ivrit`, `JS Block Letters`, `JS Bracket Letters`, `JS Capital Curves`, `JS Cursive`, `JS Stick Letters`, `Jacky`, `Jazmine`, `Jerusalem`, `Katakana`, `Kban`, `Keyboard`, `Knob`, `Konto Slant`, `Konto`, `LCD`, `Larry 3D 2`")
                    .setColor(color)
                    .setFooter("$ascii fonts 4 for next page")

                return message.channel.send(embed)
            } else if (args[1] == "4") {
                const embed = new MessageEmbed()
                    .setTitle("ascii fonts page 4")
                    .setDescription("`Larry 3D`, `Lean`, `Letters`, `Lil Devil`, `Line Blocks`, `Linux`, `Lockergnome`, `Madrid`, `Marquee`, `Maxfour`, `Merlin1`, `Merlin2`, `Mike`, `Mini`, `Mirror`, `Mnemonic`, `Modular`, `Morse`, `Morse2`, `Moscow`, `Mshebrew210`, `Muzzle`, `NScript`, `NT Greek`, `NV Script`, `Nancyj-Fancy`, `Nancyj-Improved`, `Nancyj-Underlined`, `Nancyj`, `Nipples`, `O8`, `OS2`, `Octal`, `Ogre`, `Old Banner`, `Pawp`, `Peaks Slant`, `Peaks`, `Pebbles`, `Pepper`, `Poison`, `Puffy`, `Puzzle`, `Pyramid`, `Rammstein`, `Rectangles`, `Red Phoenix`, `Relief`, `Relief2`, `Reverse`, `Roman`, `Rot13`, `Rot13`, `Rotated`, `Rounded`, `Rowan Cap`, `Rozzo`, `Runic`, `Runyc`, `S Blood`, `SL Script`, `Santa Clara`, `Script`")
                    .setColor(color)
                    .setFooter("$ascii fonts 5 for next page")

                return message.channel.send(embed)
            } else if (args[1] == "5") {
                const embed = new MessageEmbed()
                    .setTitle("ascii fonts page 5")
                    .setDescription("`Serifcap`, `Shadow`, `Shimrod`, `Short`, `Slant Relief`, `Slant`, `Slide`, `Small Caps`, `Small Isometric1`, `Small Keyboard`, `Small Poison`, `Small Script`, `Small Shadow`, `Small Slant`, `Small Tengwar`, `Small`, `Soft`, `Speed`, `Spliff`, `Stacey`, `Stampate`, `Stampatello`, `Standard`, `Star Strips`, `Star Wars`, `Stellar`, `Stforek`, `Stick Letters`, `Stop`, `Straight`, `Stronger Than All`, `Sub-Zero`, `Swamp Land`, `Swan`, `Sweet`, `THIS`, `Tanja`, `Tengwar`, `Term`, `Test1`, `The Edge`, `Thick`, `Thin`, `Thorned`, `Three Point`, `Ticks Slant`, `Ticks`, `Tiles`, `Tinker-Toy`, `Tombstone`, `Train`, `Trek`, `Tsalagi`, `Tubular`, `Twisted`, `Two Point`, `USA Flag`, `Univers`, `Varsity`, `Wavy`, `Weird`, `Wet Letter`, `Whimsy`, `Wow`")
                    .setColor(color)
                    .setFooter("bot.tekoh.wtf")

                return message.channel.send(embed)
            } else {
                return message.channel.send("❌ $ascii fonts <page (1/2/3/4/5)>")
            }
        }
        
        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.member.id)
        }, 5000)
        
        let font = "Standard"
        let text = ""

        if (args.join().includes("|")) {
            font = args.join(" ").split(" | ")[1]
            text = args.join(" ").split(" | ")[0]
        } else {
            text = args.join(" ")
        }

        let asciiString = "";
        let fail = false

        await ascii(text, {
            font: font
        }, async (err, data) => {
            if (!err) {
                asciiString = "```" + data + "```";
            } else {
                fail = true
                return message.channel.send("❌ error - maybe an incorrect font - fonts are **cAsE sEnSiTiVe**")
            }
        });

        setTimeout(() => {

            if (fail) {
                return
            }
    
            if (asciiString.length >= 2000) {
                return message.channel.send("❌ ascii text exceeds discord message size");
            }
            
            message.member.send(asciiString).then( () => {
                return message.channel.send("✅ success **-** check your dms");
            }).catch( () => {
                return message.channel.send("❌ unable to send you a dm");
            });
        }, 500);
        

    }
};