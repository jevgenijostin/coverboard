export type Member = { id: string; name: string };
export type ShiftStatus = "open" | "claimed" | "confirmed";
export type Shift = {
  id: string;
  day: number; // 0 = Monday .. 6 = Sunday
  start: string; // "HH:MM", 24h
  end: string; // "HH:MM", 24h
  note: string;
  postedBy: string; // member id
  status: ShiftStatus;
  claimedBy: string | null; // member id
};
export type Team = {
  id: string;
  name: string;
  members: Member[];
  shifts: Shift[];
};
export const STORAGE_KEY = "coverboard.v1";
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function createTeam(name: string): Team {
  const trimmed = name.trim();
  if (!trimmed) throw Error("Team name is required");
  return { id: crypto.randomUUID(), name: trimmed.slice(0, 60), members: [], shifts: [] };
}

export function renameTeam(team: Team, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw Error("Team name is required");
  team.name = trimmed.slice(0, 60);
}

export function addMember(team: Team, name: string): Member {
  const trimmed = name.trim();
  if (!trimmed) throw Error("Member name is required");
  const member: Member = { id: crypto.randomUUID(), name: trimmed.slice(0, 60) };
  team.members.push(member);
  return member;
}

export function removeMember(team: Team, id: string) {
  team.members = team.members.filter((m) => m.id !== id);
  team.shifts = team.shifts
    .filter((s) => s.postedBy !== id)
    .map((s) =>
      s.claimedBy === id ? { ...s, status: "open" as ShiftStatus, claimedBy: null } : s,
    );
}

export function postShift(
  team: Team,
  input: { day: number; start: string; end: string; note: string; postedBy: string },
): Shift {
  const { day, start, end, note, postedBy } = input;
  if (!Number.isInteger(day) || day < 0 || day > 6) throw Error("Pick a valid day");
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) throw Error("Use HH:MM start and end times");
  if (start >= end) throw Error("End time must be after start time");
  if (!team.members.some((m) => m.id === postedBy)) throw Error("Unknown team member");
  const shift: Shift = {
    id: crypto.randomUUID(),
    day,
    start,
    end,
    note: note.trim().slice(0, 140),
    postedBy,
    status: "open",
    claimedBy: null,
  };
  team.shifts.push(shift);
  return shift;
}

function requireShift(team: Team, shiftId: string): Shift {
  const shift = team.shifts.find((s) => s.id === shiftId);
  if (!shift) throw Error("Shift not found");
  return shift;
}

export function claimShift(team: Team, shiftId: string, memberId: string) {
  const shift = requireShift(team, shiftId);
  if (shift.status !== "open") throw Error("Shift is no longer open");
  if (!team.members.some((m) => m.id === memberId)) throw Error("Unknown team member");
  if (memberId === shift.postedBy) throw Error("You can't claim your own shift");
  shift.status = "claimed";
  shift.claimedBy = memberId;
}

export function releaseShift(team: Team, shiftId: string) {
  const shift = requireShift(team, shiftId);
  if (shift.status !== "claimed") throw Error("Only a claimed shift can be released");
  shift.status = "open";
  shift.claimedBy = null;
}

export function confirmShift(team: Team, shiftId: string) {
  const shift = requireShift(team, shiftId);
  if (shift.status !== "claimed") throw Error("Only a claimed shift can be confirmed");
  shift.status = "confirmed";
}

export function cancelShift(team: Team, shiftId: string) {
  const shift = requireShift(team, shiftId);
  if (shift.status === "confirmed") throw Error("Release a confirmed shift before cancelling it");
  team.shifts = team.shifts.filter((s) => s.id !== shiftId);
}

export function weekCoverage(shifts: Shift[]) {
  const total = shifts.length;
  const open = shifts.filter((s) => s.status === "open").length;
  const claimed = shifts.filter((s) => s.status === "claimed").length;
  const confirmed = shifts.filter((s) => s.status === "confirmed").length;
  return { total, open, claimed, confirmed, ratio: total ? (claimed + confirmed) / total : 1 };
}

/** Monday..Sunday dates for the week containing `reference`. */
export function weekDates(reference: Date = new Date()): Date[] {
  const d = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const mondayOffset = (d.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  d.setDate(d.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day;
  });
}

function validTeam(value: unknown): value is Team {
  if (!value || typeof value !== "object") return false;
  const t = value as Team;
  const str = (s: unknown) => typeof s === "string" && s.trim().length > 0;
  if (!str(t.id) || !str(t.name) || !Array.isArray(t.members) || !Array.isArray(t.shifts))
    return false;
  if (
    !t.members.every((m) => m && str(m.id) && str(m.name)) ||
    new Set(t.members.map((m) => m.id)).size !== t.members.length
  )
    return false;
  const memberIds = t.members.map((m) => m.id);
  const statuses: ShiftStatus[] = ["open", "claimed", "confirmed"];
  if (
    !t.shifts.every(
      (s) =>
        s &&
        str(s.id) &&
        Number.isInteger(s.day) &&
        s.day >= 0 &&
        s.day <= 6 &&
        TIME_RE.test(s.start) &&
        TIME_RE.test(s.end) &&
        s.start < s.end &&
        typeof s.note === "string" &&
        memberIds.includes(s.postedBy) &&
        statuses.includes(s.status) &&
        (s.claimedBy === null || (memberIds.includes(s.claimedBy) && s.claimedBy !== s.postedBy)) &&
        (s.status === "open") === (s.claimedBy === null),
    ) ||
    new Set(t.shifts.map((s) => s.id)).size !== t.shifts.length
  )
    return false;
  return true;
}

export function load(storage: Pick<Storage, "getItem">): Team[] {
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
    if (
      data?.schemaVersion !== 1 ||
      !Array.isArray(data.teams) ||
      !data.teams.every(validTeam) ||
      new Set(data.teams.map((t: Team) => t.id)).size !== data.teams.length
    )
      return [];
    return data.teams;
  } catch {
    return [];
  }
}

export function save(teams: Team[], storage: Pick<Storage, "setItem">): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, teams }));
    return true;
  } catch {
    return false;
  }
}
