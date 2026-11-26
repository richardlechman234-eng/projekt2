// Smoke test: crawls every internal page from "/" and checks each one at every viewport
// (mobile / tablet / desktop projects in playwright.config.js).
import { test, expect } from "@playwright/test";
import fs from "node:fs";

const MAX_PAGES = 40;

async function collectPages(request, baseURL) {
  const seen = new Set(["/"]);
  const queue = ["/"];
  while (queue.length && seen.size < MAX_PAGES) {
    const path = queue.shift();
    const res = await request.get(path);
    if (!res.ok() || !(res.headers()["content-type"] || "").includes("text/html")) continue;
    const html = await res.text();
    for (const [, href] of html.matchAll(/href="([^"#?]+)[^"]*"/g)) {
      let url;
      try {
        url = new URL(href, baseURL + path);
      } catch {
        continue;
      }
      if (url.origin !== new URL(baseURL).origin) continue;
      if (
        /\.(css|js|png|jpe?g|webp|avif|svg|ico|xml|txt|pdf|json|webmanifest|woff2?|ttf|otf|glb|gltf|wasm|mp4|webm)$/i.test(url.pathname)
      )
        continue;
      const clean = url.pathname.replace(/\/index\.html$/, "/");
      if (!seen.has(clean)) {
        seen.add(clean);
        queue.push(clean);
      }
    }
  }
  return [...seen];
}

test("all internal pages: load, no console errors, no horizontal scroll, images ok", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const pages = await collectPages(request, baseURL);
  const problems = [];
  fs.mkdirSync("qa/screenshots", { recursive: true });

  for (const path of pages) {
    const consoleErrors = [];
    const failed = [];
    const onConsole = (msg) => msg.type() === "error" && consoleErrors.push(msg.text());
    const onPageError = (err) => consoleErrors.push(err.message);
    const onResponse = (res) => res.status() >= 400 && failed.push(`${res.status()} ${res.url()}`);
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    const res = await page.goto(path, { waitUntil: "networkidle" });
    if (!res || !res.ok()) problems.push(`${path}: HTTP ${res ? res.status() : "no response"}`);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow > 1) problems.push(`${path}: horizontal scroll (${overflow}px too wide)`);

    const brokenImages = await page.$$eval("img", (imgs) =>
      imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
    );
    brokenImages.forEach((src) => problems.push(`${path}: broken image ${src}`));

    const h1Count = await page.locator("h1").count();
    if (h1Count !== 1) problems.push(`${path}: ${h1Count} <h1> elements (expected 1)`);

    consoleErrors.forEach((e) => problems.push(`${path}: console error: ${e}`));
    failed.forEach((f) => problems.push(`${path}: failed request ${f}`));

    const name =
      (path === "/" ? "index" : path.replace(/[\\/]+/g, "_").replace(/^_|_$/g, "")) || "index";
    await page.screenshot({
      path: `qa/screenshots/${testInfo.project.name}-${name}.png`,
      fullPage: true,
    });

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }

  console.log(`[${testInfo.project.name}] checked ${pages.length} page(s): ${pages.join(", ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("tel: and mailto: links contain real values", async ({ page }) => {
  await page.goto("/");
  const links = await page.$$eval("a[href^='tel:'], a[href^='mailto:']", (as) =>
    as.map((a) => a.getAttribute("href")),
  );
  const bad = links.filter((h) => /TODO|example\.|^tel:0*$|^tel:\+?0+$|^mailto:$/i.test(h));
  expect(bad, `placeholder contact links: ${bad.join(", ")}`).toEqual([]);
});
