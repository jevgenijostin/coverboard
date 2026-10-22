export type LicensePayload = {
  version: 1;
  tier: "paid";
  issuedAt: number;
  licenseId: string;
  expiresAt?: number;
};
export type LicenseState = { key: string; payload: LicensePayload } | null;
export const LICENSE_STORAGE_KEY = "coverboard.license.v1";
// Deliberately inspectable: demo licensing only, not payment security.
export const DEMO_SECRET = "coverboard-demo-v1-client-inspectable-secret";
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
async function signingKey() {
  return crypto.subtle.importKey("raw", encoder.encode(DEMO_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signLicense(payload: LicensePayload): Promise<string> {
  const body = btoa(JSON.stringify(payload));
  return `${body}.${hex(await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(body)))}`;
}
export function demoPayload(now = Date.now(), licenseId: string = crypto.randomUUID()): LicensePayload {
  return { version: 1, tier: "paid", issuedAt: now, licenseId };
}
export async function verifyLicense(input: unknown, now = Date.now()): Promise<LicenseState> {
  try {
    if (typeof input !== "string" || input.length > 8192) return null;
    const key = input.trim();
    const parts = key.split(".");
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
    const signature = Uint8Array.from(parts[1].match(/../g)!, b => parseInt(b, 16));
    if (!await crypto.subtle.verify("HMAC", await signingKey(), signature, encoder.encode(parts[0]))) return null;
    const p = JSON.parse(atob(parts[0]));
    if (!p || p.version !== 1 || p.tier !== "paid" ||
        !Number.isSafeInteger(p.issuedAt) || p.issuedAt < 0 || p.issuedAt > now ||
        typeof p.licenseId !== "string" || !p.licenseId.trim() ||
        (p.expiresAt !== undefined && (!Number.isSafeInteger(p.expiresAt) || p.expiresAt <= p.issuedAt || p.expiresAt <= now))) return null;
    return { key, payload: p };
  } catch { return null; }
}
export function isEntitled(state: LicenseState, tier: "free" | "paid", now = Date.now()): boolean {
  return tier === "free" || !!(state && state.payload.issuedAt <= now && (state.payload.expiresAt === undefined || state.payload.expiresAt > now));
}
export function canCreateTeam(state: LicenseState, existingCount: number, now = Date.now()): boolean {
  return existingCount < 1 || isEntitled(state, "paid", now);
}
export function canAddMember(state: LicenseState, existingCount: number, now = Date.now()): boolean {
  return existingCount < 4 || isEntitled(state, "paid", now);
}
export function canPostShift(state: LicenseState, activeCount: number, now = Date.now()): boolean {
  return activeCount < 3 || isEntitled(state, "paid", now);
}
export async function loadLicense(storage: Pick<Storage, "getItem">): Promise<LicenseState> {
  try {
    const saved = JSON.parse(storage.getItem(LICENSE_STORAGE_KEY) ?? "null");
    // Always revalidate the key; cached entitlements are never authoritative.
    return await verifyLicense(saved?.key);
  } catch { return null; }
}
export function saveLicense(state: LicenseState, storage: Pick<Storage, "setItem" | "removeItem">): boolean {
  try {
    if (state) storage.setItem(LICENSE_STORAGE_KEY, JSON.stringify({ key: state.key, entitlements: { tier: "paid", unlimitedTeams: true, unlimitedMembers: true, unlimitedShifts: true } }));
    else storage.removeItem(LICENSE_STORAGE_KEY);
    return true;
  } catch { return false; }
}
