// Admin panel guard: admin.html must load, show the login form, and reach Supabase Auth.
// A login with a non-existent account must come back as "Nesprávny e-mail alebo heslo."
// (that message only appears when the request reached Supabase, so CSP/network/config are OK).
import { test, expect } from "@playwright/test";

test("admin.html loads, no console errors, login reaches Supabase", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  const res = await page.goto("/admin.html");
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#login-form input[name=email]")).toBeVisible();

  await page.fill("#login-form input[name=email]", "qa-test@example.invalid");
  await page.fill("#login-form input[name=password]", "nespravne-heslo-qa");
  await page.click("#login-btn");
  const msg = page.locator("#login-error");
  await expect(msg).toBeVisible({ timeout: 15000 });
  await expect(msg).toHaveText(/Nesprávny e-mail alebo heslo/);

  // Supabase answers a wrong password with HTTP 400, which Chrome logs as a console error. Ignore only that.
  const real = errors.filter((t) => !/status of 400/.test(t));
  expect(real, real.join("\n")).toEqual([]);
});
