// Prerender: writes the price-list rows (service name + what is included + price) from data.js
// into index.html between <!-- services:start --> and <!-- services:end -->, so search engines
// see them without running JavaScript. site.js replaces the same rows at runtime (no duplicates).
// Also refreshes the sha256 of the inline importmap in the Content-Security-Policy meta tag.
// Run: npm run prerender   (after every change of data.js services or of the importmap).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "data.js");
const htmlPath = join(root, "index.html");

// data.js sets window.AUTO_MM; evaluate it with a fake window
const window = {};
new Function("window", readFileSync(dataPath, "utf8"))(window);
const services = window.AUTO_MM.services;

const esc = (t) =>
  String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const rows = services
  .map((s) => {
    const items = s.items.filter((t) => !t.startsWith("[")).join(" · ");
    return (
      `<div class="price-row" role="row" data-id="${esc(s.id)}">` +
      `<span role="cell" class="p-name">${esc(s.name)}</span>` +
      `<span role="cell" class="p-items">${esc(items)}</span>` +
      `<span role="cell" class="p-price">${esc(s.price)}<a class="p-book" href="#objednavka" aria-label="Objednať: ${esc(s.name)}">Objednať</a></span>` +
      `</div>`
    );
  })
  .join("\n          ");

let html = readFileSync(htmlPath, "utf8");
const re = /<!-- services:start -->[\s\S]*?<!-- services:end -->/;
if (!re.test(html))
  throw new Error(
    "Markers <!-- services:start --> / <!-- services:end --> not found in index.html",
  );
html = html.replace(
  re,
  () => `<!-- services:start -->\n          ${rows}\n          <!-- services:end -->`,
);

// CSP hash of the inline importmap (exact text between the tags)
const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (m) {
  const hash = "sha256-" + createHash("sha256").update(m[1]).digest("base64");
  html = html.replace(/'sha256-[A-Za-z0-9+/=]+'/, () => `'${hash}'`);
}

writeFileSync(htmlPath, html);
console.warn(
  `prerender: ${services.length} services written${m ? ", importmap CSP hash updated" : ""}`,
);
