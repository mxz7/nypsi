import { manager } from "../..";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { isImageUrl, suggestImage } from "../../utils/functions/image";

export default {
  name: "images",
  cron: "0 0 * * 0",
  async run(log) {
    for (let i = 0; i < Math.floor(Math.random() * 4) + 1; i++) {
      const res = await fetch("https://cataas.com/cat?json=true");

      if (!res.ok) break;

      const json = await res.json();

      const d = await fetch(`https://cataas.com/cat/${json._id}`);

      const ext = d.headers.get("content-type").split("/")[1];

      log(`suggesting https://cataas.com/cat/${json._id}.${ext}...`);
      await suggestImage(
        Constants.BOT_USER_ID,
        "cat",
        `https://cataas.com/cat/${json._id}.${ext}`,
        manager,
      );
    }

    for (let i = 0; i < Math.floor(Math.random() * 4) + 1; i++) {
      const res = await fetch("https://random.dog/woof.json");

      if (!res.ok) break;

      const json = await res.json();

      if (!isImageUrl(json.url.toLowerCase())) continue;

      log(`suggesting ${json.url}`);
      await suggestImage(Constants.BOT_USER_ID, "dog", json.url, manager);
    }

    for (let i = 0; i < Math.floor(Math.random() * 4) + 1; i++) {
      const res = await fetch("https://api.capy.lol/v1/capybara?json=true");

      if (!res.ok) break;

      const json = await res.json();

      const d = await fetch(json.data.url);

      const ext = d.headers.get("content-type").split("/")[1];

      log(`suggesting ${json.data.url}.${ext}...`);
      await suggestImage(Constants.BOT_USER_ID, "capybara", `${json.data.url}.${ext}`, manager);
    }
  },
} satisfies Job;
