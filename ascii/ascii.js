const figlet = require("figlet")

figlet("streaks", function(err, data) {
    if (err) {
        console.log("something went wrong");
        return console.dir(err);
    }
    console.log(data);
});