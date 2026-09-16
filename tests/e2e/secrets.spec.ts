import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { testPool } from "../support/database";

const pool = testPool();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const revealHeaders = { "X-GhostKey-Reveal": "1" };

async function create(page: Page, plaintext = "Synthetic test secret. Never a real credential.", views = "1", expiration = "86400") {
  await page.goto("/");
  await page.getByLabel("Your secret", { exact: true }).fill(plaintext);
  await page.getByLabel("MAX VIEWS").selectOption(views);
  await page.getByLabel("EXPIRES AFTER").selectOption(expiration);
  if (expiration === "custom") await page.getByLabel("Custom duration").fill("2");
  await page.getByRole("button", { name: "Create secret", exact: true }).click();
  await expect(page.getByLabel("Secure link", { exact: true })).toBeVisible();
  const link = await page.getByLabel("Secure link", { exact: true }).inputValue();
  const id = new URL(link).pathname.split("/").at(-1)!;
  return { link, id, plaintext };
}

test.beforeEach(async () => { await pool.query("truncate public.secrets, public.secret_tombstones, public.secret_rate_limits"); });
test.afterAll(async () => { await pool.end(); });

test("creates, copies, reveals and burns a secret without leaking plaintext or keys", async ({ page, context }) => {
  const network: { url: string; body: string; headers: Record<string, string> }[] = [];
  const errors: string[] = [];
  context.on("request", (request) => { network.push({ url: request.url(), body: request.postData() ?? "", headers: request.headers() }); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 410\b/.test(message.text())) errors.push(message.text()); });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const secret = await create(page, "Synthetic secret 🔑\n<script>window.injected = true</script>");
  const key = new URL(secret.link).hash.slice(1);
  expect(key).toHaveLength(43);
  await page.getByRole("button", { name: "Copy secure link" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(secret.link);

  const stored = (await pool.query("select * from public.secrets")).rows[0] as Record<string, unknown>;
  expect(JSON.stringify(stored)).not.toContain(secret.plaintext);
  expect(JSON.stringify(stored)).not.toContain(key);
  expect(stored.secret_hash).toBe(hash(secret.id));
  expect(stored.max_views).toBe(1);
  expect(stored.view_count).toBe(0);

  const recipient = await context.newPage();
  recipient.on("pageerror", (error) => errors.push(error.message));
  recipient.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 410\b/.test(message.text())) errors.push(message.text()); });
  const navigation = await recipient.goto(secret.link);
  expect(navigation?.headers()["content-security-policy"]).not.toContain("unsafe-eval");
  expect(navigation?.headers()["content-security-policy"]).not.toContain("unsafe-inline");
  expect(navigation?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(recipient.getByRole("button", { name: "Reveal secret", exact: true })).toBeVisible();
  expect((await pool.query("select view_count from public.secrets")).rows[0]?.view_count).toBe(0);
  await recipient.getByRole("button", { name: "Reveal secret", exact: true }).click();
  await expect(recipient.getByRole("dialog")).toBeVisible();
  await recipient.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await pool.query("select view_count from public.secrets")).rows[0]?.view_count).toBe(0);
  await recipient.getByRole("button", { name: "Reveal secret", exact: true }).click();
  await recipient.getByRole("button", { name: "Reveal secret now", exact: true }).click();
  await expect(recipient.getByLabel("Decrypted secret")).toHaveText(secret.plaintext);
  await expect(recipient.getByText("This secret has been consumed.", { exact: true })).toBeVisible();
  expect(new URL(recipient.url()).hash).toBe("");
  expect((await pool.query("select * from public.secrets")).rows).toHaveLength(0);
  expect(await recipient.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, injected: Object.hasOwn(window, "injected") }))).toEqual({ local: 0, session: 0, injected: false });
  await recipient.getByRole("button", { name: "Copy secret", exact: true }).click();
  expect(await recipient.evaluate(() => navigator.clipboard.readText())).toBe(secret.plaintext);
  await recipient.getByRole("button", { name: "Clear from screen" }).click();
  await expect(recipient.getByText("SCREEN CLEARED", { exact: true })).toBeVisible();
  expect(await recipient.locator("body").textContent()).not.toContain(secret.plaintext);
  await recipient.goto(secret.link);
  await expect(recipient.getByText("SECRET CONSUMED", { exact: true })).toBeVisible();

  for (const request of network) {
    expect(request.url).not.toContain(key);
    expect(request.body).not.toContain(key);
    expect(request.body).not.toContain(secret.plaintext);
    expect(JSON.stringify(request.headers)).not.toContain(key);
  }
  expect(errors).toEqual([]);
});

for (const views of [5, 10, 0]) {
  test(`enforces ${views === 0 ? "unlimited" : views} views through the real API`, async ({ page, request }) => {
    const secret = await create(page, "Synthetic multiview secret", String(views));
    const attempts = views === 0 ? 12 : views + 5;
    const responses = await Promise.all(Array.from({ length: attempts }, () => request.get(`/api/secrets/${secret.id}`, { headers: revealHeaders })));
    expect(responses.filter((response) => response.status() === 200)).toHaveLength(views === 0 ? attempts : views);
    expect(responses.filter((response) => response.status() === 410)).toHaveLength(views === 0 ? 0 : 5);
    const records = (await pool.query("select view_count from public.secrets")).rows;
    expect(records).toHaveLength(views === 0 ? 1 : 0);
    if (views === 0) expect(records[0]?.view_count).toBe(attempts);
  });
}

test("applies a custom expiration and refuses expired ciphertext", async ({ page, context, request }) => {
  const secret = await create(page, "Synthetic expiring secret", "1", "custom");
  const record = (await pool.query("select extract(epoch from expires_at - created_at)::integer as duration from public.secrets")).rows[0];
  expect(record?.duration).toBe(120);
  await pool.query("update public.secrets set expires_at = clock_timestamp() - interval '1 second'");
  const recipient = await context.newPage();
  await recipient.goto(secret.link);
  await expect(recipient.getByText("SECRET EXPIRED", { exact: true })).toBeVisible();
  const response = await request.get(`/api/secrets/${secret.id}`, { headers: revealHeaders });
  expect(response.status()).toBe(410);
  expect((await response.json()).error.code).toBe("SECRET_EXPIRED");
  expect((await pool.query("select * from public.secrets")).rows).toHaveLength(0);
});

test("allows only the creator to revoke a link after confirmation", async ({ page, request, context }) => {
  const secret = await create(page);
  const unauthorized = await request.delete(`/api/secrets/${secret.id}`, { headers: { Authorization: `Bearer ${randomBytes(32).toString("base64url")}` } });
  expect(unauthorized.status()).toBe(403);
  await page.getByRole("button", { name: "Delete secret", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Delete secret", exact: true }).click();
  await expect(page.getByText("SECRET DELETED", { exact: true })).toBeVisible();
  expect((await pool.query("select * from public.secrets")).rows).toHaveLength(0);
  const recipient = await context.newPage();
  await recipient.goto(secret.link);
  await expect(recipient.getByText("SECRET CONSUMED", { exact: true })).toBeVisible();
});

test("does not consume on previews, missing keys, or invalid links", async ({ page, request, context }) => {
  const secret = await create(page);
  const preview = await request.get(`/api/secrets/${secret.id}`);
  expect(preview.status()).toBe(400);
  expect((await request.head(`/api/secrets/${secret.id}`)).status()).toBe(200);
  const recipient = await context.newPage();
  await recipient.goto(`/s/${secret.id}`);
  await expect(recipient.getByText("KEY MISSING", { exact: true })).toBeVisible();
  expect((await pool.query("select view_count from public.secrets")).rows[0]?.view_count).toBe(0);
  await recipient.goto("/s/invalid-id#incomplete");
  await expect(recipient.getByText("INVALID LINK", { exact: true })).toBeVisible();
});

test("fails authenticated decryption safely for a valid but incorrect key", async ({ page, context }) => {
  const secret = await create(page);
  const recipient = await context.newPage();
  await recipient.goto(`${new URL(secret.link).pathname}#${randomBytes(32).toString("base64url")}`);
  await recipient.getByRole("button", { name: "Reveal secret", exact: true }).click();
  await recipient.getByRole("button", { name: "Reveal secret now", exact: true }).click();
  await expect(recipient.getByText("DECRYPTION FAILED", { exact: true })).toBeVisible();
  expect((await pool.query("select * from public.secrets")).rows).toHaveLength(0);
  expect(new URL(recipient.url()).hash).toBe("");
});

test("works at mobile widths and supports keyboard creation without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Secrets that disappear." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("Your secret", { exact: true }).fill("Synthetic mobile secret");
  await page.getByLabel("Your secret", { exact: true }).press("Control+Enter");
  await expect(page.getByLabel("Secure link", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const link = await page.getByLabel("Secure link", { exact: true }).inputValue();
  await page.goto(link);
  await page.getByRole("button", { name: "Reveal secret", exact: true }).click();
  await page.getByRole("button", { name: "Reveal secret now", exact: true }).click();
  await expect(page.getByLabel("Decrypted secret")).toHaveText("Synthetic mobile secret");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/security");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
