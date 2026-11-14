// 備份 Cloudflare KV（按讚數＋縮網址）到 ../backup/likes_YYYYMMDD_HHMMSS.json
// 用法：在 cloudflare 資料夾執行  node backup_likes.js
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const NS = "b755073011434d4ebe2d3d32b2c02939";
const wrangler = (args) =>
  execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });

const keys = JSON.parse(wrangler(["kv", "key", "list", "--namespace-id", NS, "--remote"])).map((k) => k.name);
const data = {};
for (const k of keys) {
  const raw = wrangler(["kv", "key", "get", k, "--namespace-id", NS, "--remote"]).trim();
  try { data[k] = JSON.parse(raw); } catch { data[k] = raw; }
}

const likes = Object.entries(data).filter(([k]) => !k.startsWith("link:"));
const total = likes.reduce((s, [, v]) => s + (v.count || 0), 0);

const tp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
const dir = path.join(__dirname, "..", "backup");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `likes_${tp.slice(0, 8)}_${tp.slice(8)}.json`);
fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
console.log(`已備份 ${keys.length} 筆（按讚照片 ${likes.length} 張、總讚數 ${total}）\n${file}`);
