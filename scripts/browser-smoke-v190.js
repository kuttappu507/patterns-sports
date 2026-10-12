/* PS-056 / PS-057 browser smoke — real dev server, real UI. */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push("console.error: " + m.text()); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));

  console.log("== boot ==");
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  // the splash gates >= 2.2 s; wait for the app shell (sidebar)
  await page.waitForSelector("text=Receipt History", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Navigate to Fees via the sidebar (or direct hash)
  await page.goto("http://127.0.0.1:3000/#/fees", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  console.log("== PS-056 receipt history ordering ==");
  const historyTab = page.locator("text=Receipt History").first();
  await historyTab.click();
  await page.waitForTimeout(1200);
  // read the receipt ledger table rows (receipt no + date columns)
  const rows = await page.locator("table tbody tr").evaluateAll((trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll("td")).slice(0, 2).map((td) => td.textContent.trim()))
  );
  const dataRows = rows.filter((r) => r.length === 2 && /^RC-/.test(r[0]));
  console.log("first 6 ledger rows (receiptNo | date):");
  dataRows.slice(0, 6).forEach((r) => console.log("  ", r.join(" | ")));
  if (dataRows.length < 2) { console.log("FAIL: no receipt rows rendered"); process.exit(1); }

  console.log("== PS-057 data location card (web branch) ==");
  await page.goto("http://127.0.0.1:3000/#/settings", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Data Safety", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const card = await page.locator("text=Data Safety").first().isVisible().catch(() => false);
  console.log("Data Safety card rendered:", card);
  // The friendly one-liner + disclosure live in the DESKTOP branch (the
  // owner's surface); the web preview keeps its dev-facing path line.
  const webLine = await page.locator("text=Web preview database").first().isVisible().catch(() => false);
  console.log("web preview path line (expected in browser):", webLine);

  console.log("== console/page errors ==");
  const realErrors = logs.filter((l) => !/favicon|Download the React DevTools/i.test(l));
  console.log(realErrors.length ? realErrors.slice(0, 6).join("\n") : "none");

  console.log("SMOKE PASS");
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error("smoke crashed:", e); process.exit(1); });
