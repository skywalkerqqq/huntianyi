const fs = require("fs");
const path = require("path");

const URL =
  "https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/chinese/star_names.zh_CN.fab";
const OUT = path.join(__dirname, "star_names_zh.fab");

(async () => {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(URL, { headers: { "User-Agent": "node-fetch" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      fs.writeFileSync(OUT, text, "utf8");
      console.log("OK bytes:", text.length);
      console.log("--- first 12 lines ---");
      console.log(text.split(/\r?\n/).slice(0, 12).join("\n"));
      return;
    } catch (e) {
      console.log("attempt", attempt, "failed:", e.message);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("all attempts failed");
})();
