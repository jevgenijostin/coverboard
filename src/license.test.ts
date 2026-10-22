import { describe, expect, it } from "vitest";
import {
  LICENSE_STORAGE_KEY,
  canAddMember,
  canCreateTeam,
  canPostShift,
  demoPayload,
  isEntitled,
  loadLicense,
  saveLicense,
  signLicense,
  verifyLicense,
} from "./license";
import type { LicensePayload } from "./license";
const now = 1800000000000;
const payload = () => demoPayload(now, "demo-test");

describe("demo licenses", () => {
  it("round trips a signed, versioned paid license", async () => {
    const key = await signLicense(payload());
    const state = await verifyLicense(key, now);
    expect(state?.payload).toEqual(payload());
    expect(isEntitled(state, "paid", now)).toBe(true);
    expect(isEntitled(null, "free")).toBe(true);
  });
  it("rejects signature and payload tampering", async () => {
    const key = await signLicense(payload());
    expect(await verifyLicense(key.slice(0, -1) + (key.endsWith("0") ? "1" : "0"), now)).toBeNull();
    expect(
      await verifyLicense(btoa(JSON.stringify({ ...payload(), licenseId: "changed" })) + "." + key.split(".")[1], now),
    ).toBeNull();
  });
  it.each([null, "", "garbage", "e30=.00", "a.b.c", "x".repeat(9000)])("rejects malformed input %j", async (input) => {
    expect(await verifyLicense(input, now)).toBeNull();
  });
  it.each([
    {},
    { version: 2 },
    { tier: "free" },
    { issuedAt: "today" },
    { issuedAt: now + 1 },
    { licenseId: "" },
    { expiresAt: "later" },
    { expiresAt: now },
  ])("rejects signed missing or invalid fields %j", async (patch) => {
    const candidate = Object.keys(patch).length ? { ...payload(), ...patch } : {};
    expect(await verifyLicense(await signLicense(candidate as LicensePayload), now)).toBeNull();
  });
  it("expires at the boundary, including while the app remains open", async () => {
    const state = await verifyLicense(await signLicense({ ...payload(), expiresAt: now + 100 }), now);
    expect(canPostShift(state, 5, now + 99)).toBe(true);
    expect(canPostShift(state, 5, now + 100)).toBe(false);
  });
  it("enforces team, roster, and open-shift caps, free of charge up to the cap", () => {
    expect(canCreateTeam(null, 0)).toBe(true);
    expect(canCreateTeam(null, 1)).toBe(false);
    expect(canAddMember(null, 3)).toBe(true);
    expect(canAddMember(null, 4)).toBe(false);
    expect(canPostShift(null, 2)).toBe(true);
    expect(canPostShift(null, 3)).toBe(false);
  });
  it("lifts every cap for a valid paid license", async () => {
    const paid = await verifyLicense(await signLicense(payload()), now);
    expect(canCreateTeam(paid, 5, now)).toBe(true);
    expect(canAddMember(paid, 50, now)).toBe(true);
    expect(canPostShift(paid, 50, now)).toBe(true);
  });
  it("persists entitlements, revalidates keys, and removes them", async () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      },
    };
    const paid = await verifyLicense(await signLicense(demoPayload()));
    expect(saveLicense(paid, storage)).toBe(true);
    expect(JSON.parse(data.get(LICENSE_STORAGE_KEY)!).entitlements.tier).toBe("paid");
    expect(await loadLicense(storage)).toEqual(paid);
    storage.setItem(LICENSE_STORAGE_KEY, JSON.stringify({ key: "fake", entitlements: { tier: "paid" } }));
    expect(await loadLicense(storage)).toBeNull();
    saveLicense(null, storage);
    expect(await loadLicense(storage)).toBeNull();
  });
  it("handles corrupt and denied license storage", async () => {
    expect(await loadLicense({ getItem: () => "{" })).toBeNull();
    const denied = () => {
      throw Error("denied");
    };
    expect(await loadLicense({ getItem: denied })).toBeNull();
    expect(saveLicense(null, { setItem: denied, removeItem: denied })).toBe(false);
  });
});
