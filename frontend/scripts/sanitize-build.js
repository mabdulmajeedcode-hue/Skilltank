const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "..", "build");
const staticDir = path.join(buildDir, "static");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

for (const file of walk(staticDir)) {
  if (file.endsWith(".map")) {
    fs.unlinkSync(file);
    continue;
  }
  if (!/\.(js|css|html)$/.test(file)) continue;
  const original = fs.readFileSync(file, "utf8");
  const cleaned = original
    .replaceAll("http://localhost", "https://skilltank.app")
    .replaceAll("http://127.0.0.1", "https://skilltank.app");
  if (cleaned !== original) fs.writeFileSync(file, cleaned);
}
