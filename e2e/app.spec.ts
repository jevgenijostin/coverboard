import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const demoKey = execFileSync(process.execPath, ["scripts/generate-demo-license.mjs"], { encoding: "utf8" }).trim();

async function create(page: Page, name = "Riverside Diner") {
  await page.goto("./");
  await page.getByLabel("Team name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create team" }).click();
}
async function addMembers(page: Page, names: string) {
  await page.getByRole("button", { name: "Manage roster", exact: true }).click();
  await page.getByLabel("Add crew members").fill(names);
  await page.getByRole("button", { name: "Add members", exact: true }).click();
}
async function backToBoard(page: Page) {
  await page.getByRole("button", { name: "Back to board" }).click();
}
async function actAs(page: Page, name: string) {
  await page.locator("#acting-member").selectOption({ label: name });
}
const DAY_INDEX: Record<string, string> = { Mon: "0", Tue: "1", Wed: "2", Thu: "3", Fri: "4", Sat: "5", Sun: "6" };
async function postShift(page: Page, day: string, start: string, end: string, note = "") {
  await page.locator('select[name="day"]').selectOption(DAY_INDEX[day]);
  await page.locator('input[name="start"]').fill(start);
  await page.locator('input[name="end"]').fill(end);
  if (note) await page.locator('input[name="note"]').fill(note);
  await page.getByRole("button", { name: "Post shift" }).click();
}

test("posts, claims, and confirms a shift, then persists the covered status on reload", async ({ page }) => {
  await create(page);
  await addMembers(page, "Ada\nBo");
  await backToBoard(page);

  await actAs(page, "Ada");
  await postShift(page, "Mon", "09:00", "17:00", "Register open");
  const card = page.locator(".shift-card");
  await expect(card).toContainText("Needs cover");
  await expect(card).toContainText("Posted by Ada");

  await actAs(page, "Bo");
  await card.getByRole("button", { name: "Claim shift" }).click();
  await expect(card).toContainText("Pending confirm");
  await expect(card).toContainText("Claimed by Bo");

  await card.getByRole("button", { name: "Confirm covered" }).click();
  await expect(card).toContainText("Covered");
  await expect(card.getByRole("button")).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Open board" }).click();
  await expect(page.locator(".shift-card")).toContainText("Covered");
});

test("a member can't claim their own shift, and releasing reopens it", async ({ page }) => {
  await create(page);
  await addMembers(page, "Ada\nBo");
  await backToBoard(page);
  await actAs(page, "Ada");
  await postShift(page, "Tue", "12:00", "16:00");
  const card = page.locator(".shift-card");
  await expect(card.getByRole("button", { name: "Claim shift" })).toHaveCount(0);

  await actAs(page, "Bo");
  await card.getByRole("button", { name: "Claim shift" }).click();
  await card.getByRole("button", { name: "Release claim" }).click();
  await expect(card).toContainText("Needs cover");

  await actAs(page, "Ada");
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".shift-card")).toHaveCount(0);
});

test("enforces free-tier team, roster, and open-shift caps, lifted by a license key", async ({ page }) => {
  await create(page, "First Team");
  await page.goto("./");
  await page.getByLabel("Team name", { exact: true }).fill("Second Team");
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.locator(".toast")).toContainText("Free tier limit: 1 team");
  await expect(page.locator(".team-card")).toHaveCount(1);

  await page.getByRole("button", { name: "Open board" }).click();
  await addMembers(page, "Ada\nBo\nCy\nDee\nEli");
  await expect(page.locator(".toast")).toContainText("Free tier limit: 4 members per team");
  await expect(page.locator(".roster-row")).toHaveCount(4);
  await backToBoard(page);

  await actAs(page, "Ada");
  await postShift(page, "Mon", "09:00", "12:00", "one");
  await postShift(page, "Mon", "13:00", "16:00", "two");
  await postShift(page, "Mon", "17:00", "20:00", "three");
  await postShift(page, "Tue", "09:00", "12:00", "four");
  await expect(page.locator(".toast")).toContainText("Free tier limit: 3 open shift requests per team");
  await expect(page.locator(".shift-card")).toHaveCount(3);

  await page.getByRole("button", { name: "Enter license key", exact: true }).click();
  await page.getByLabel("License key", { exact: true }).fill(demoKey);
  await page.getByRole("button", { name: "Apply license", exact: true }).click();
  await expect(page.locator("[data-tier]")).toContainText("Paid");

  await backToBoard(page);
  await postShift(page, "Tue", "09:00", "12:00", "four");
  await expect(page.locator(".shift-card")).toHaveCount(4);
  await addMembers(page, "Eli");
  await expect(page.locator(".roster-row")).toHaveCount(5);
});
