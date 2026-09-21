#!/usr/bin/env node
/* build.js — bundles index.html + style.css + src/*.js into one
 * self-contained dist/index.html (no external local file refs),
 * required for publishing as a hosted artifact and handy as a
 * single-file production build for itch.io/offline use too. */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "dist");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");

const scriptTagRe = /<script src="([^"]+)"><\/script>/g;
let match;
const scriptFiles = [];
while ((match = scriptTagRe.exec(html))) scriptFiles.push(match[1]);

let bundledJs = "";
scriptFiles.forEach((rel) => {
  const full = path.join(ROOT, rel);
  bundledJs += `\n/* ---- ${rel} ---- */\n` + fs.readFileSync(full, "utf8") + "\n";
});

let out = html;
out = out.replace('<link rel="stylesheet" href="style.css" />', `<style>\n${css}\n</style>`);
out = out.replace(scriptTagRe, ""); // remove all individual script tags
out = out.replace("</body>", `<script>\n${bundledJs}\n</script>\n</body>`);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), out, "utf8");

const sizeKb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
console.log(`Bundled ${scriptFiles.length} scripts + CSS into dist/index.html (${sizeKb} KB)`);
