const fs = require("fs");
const path = require("path");

const URL =
  "https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/chinese/index.json";
const OUT = path.join(__dirname, "stellarium_chinese.json");

(async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(URL, {
        headers: { "User-Agent": "node-fetch", Accept: "application/json" },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      fs.writeFileSync(OUT, text, "utf8");
      console.log("OK bytes:", text.length);
      return;
    } catch (e) {
      console.log("attempt", attempt, "failed:", e.message);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("all attempts failed");
})();
