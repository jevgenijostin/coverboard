import { describe, expect, it } from "vitest";
import {
  addMember,
  cancelShift,
  claimShift,
  confirmShift,
  createTeam,
  load,
  postShift,
  releaseShift,
  removeMember,
  renameTeam,
  save,
  weekCoverage,
  weekDates,
  type Team,
} from "./model";

function teamWithTwoMembers(): { team: Team; a: string; b: string } {
  const team = createTeam("Downtown Cafe");
  const a = addMember(team, "Ada").id;
  const b = addMember(team, "Bo").id;
  return { team, a, b };
}

describe("createTeam / renameTeam", () => {
  it("creates a team with an id and empty rosters", () => {
    const team = createTeam("  Night Shift  ");
    expect(team.name).toBe("Night Shift");
    expect(team.id).toBeTruthy();
    expect(team.members).toEqual([]);
    expect(team.shifts).toEqual([]);
  });
  it("rejects a blank name and truncates long ones", () => {
    expect(() => createTeam("   ")).toThrow();
    const team = createTeam("x".repeat(100));
    expect(team.name.length).toBe(60);
  });
  it("renames a team, rejecting blanks", () => {
    const team = createTeam("A");
    renameTeam(team, "  B  ");
    expect(team.name).toBe("B");
    expect(() => renameTeam(team, "")).toThrow();
  });
});

describe("addMember / removeMember", () => {
  it("adds a member with a trimmed, capped name", () => {
    const team = createTeam("A");
    const m = addMember(team, "  Cy  ");
    expect(m.name).toBe("Cy");
    expect(team.members).toHaveLength(1);
    expect(() => addMember(team, " ")).toThrow();
  });
  it("cascades: removing a poster deletes their shifts", () => {
    const { team, a, b } = teamWithTwoMembers();
    postShift(team, { day: 0, start: "09:00", end: "12:00", note: "", postedBy: a });
    removeMember(team, a);
    expect(team.members.map((m) => m.id)).toEqual([b]);
    expect(team.shifts).toHaveLength(0);
  });
  it("cascades: removing a claimer reverts the shift to open", () => {
    const { team, a, b } = teamWithTwoMembers();
    const shift = postShift(team, { day: 0, start: "09:00", end: "12:00", note: "", postedBy: a });
    claimShift(team, shift.id, b);
    removeMember(team, b);
    expect(team.shifts[0].status).toBe("open");
    expect(team.shifts[0].claimedBy).toBeNull();
  });
});

describe("postShift validation", () => {
  it("creates an open shift", () => {
    const { team, a } = teamWithTwoMembers();
    const shift = postShift(team, { day: 4, start: "18:00", end: "22:00", note: "  Close register  ", postedBy: a });
    expect(shift.status).toBe("open");
    expect(shift.claimedBy).toBeNull();
    expect(shift.note).toBe("Close register");
  });
  it("rejects an invalid day", () => {
    const { team, a } = teamWithTwoMembers();
    expect(() => postShift(team, { day: 7, start: "09:00", end: "10:00", note: "", postedBy: a })).toThrow();
    expect(() => postShift(team, { day: -1, start: "09:00", end: "10:00", note: "", postedBy: a })).toThrow();
    expect(() => postShift(team, { day: 1.5, start: "09:00", end: "10:00", note: "", postedBy: a })).toThrow();
  });
  it("rejects malformed or inverted times", () => {
    const { team, a } = teamWithTwoMembers();
    expect(() => postShift(team, { day: 0, start: "9:00", end: "10:00", note: "", postedBy: a })).toThrow();
    expect(() => postShift(team, { day: 0, start: "25:00", end: "26:00", note: "", postedBy: a })).toThrow();
    expect(() => postShift(team, { day: 0, start: "12:00", end: "09:00", note: "", postedBy: a })).toThrow();
    expect(() => postShift(team, { day: 0, start: "12:00", end: "12:00", note: "", postedBy: a })).toThrow();
  });
  it("rejects an unknown poster", () => {
    const { team } = teamWithTwoMembers();
    expect(() => postShift(team, { day: 0, start: "09:00", end: "10:00", note: "", postedBy: "ghost" })).toThrow();
  });
});

describe("claim / release / confirm / cancel", () => {
  it("walks a shift through its full lifecycle", () => {
    const { team, a, b } = teamWithTwoMembers();
    const shift = postShift(team, { day: 0, start: "09:00", end: "10:00", note: "", postedBy: a });
    claimShift(team, shift.id, b);
    expect(team.shifts[0].status).toBe("claimed");
    expect(team.shifts[0].claimedBy).toBe(b);
    releaseShift(team, shift.id);
    expect(team.shifts[0].status).toBe("open");
    expect(team.shifts[0].claimedBy).toBeNull();
    claimShift(team, shift.id, b);
    confirmShift(team, shift.id);
    expect(team.shifts[0].status).toBe("confirmed");
  });
  it("blocks claiming your own shift, a missing shift, or an already-claimed one", () => {
    const { team, a, b } = teamWithTwoMembers();
    const shift = postShift(team, { day: 0, start: "09:00", end: "10:00", note: "", postedBy: a });
    expect(() => claimShift(team, shift.id, a)).toThrow();
    expect(() => claimShift(team, "ghost", b)).toThrow();
    expect(() => claimShift(team, shift.id, "ghost")).toThrow();
    claimShift(team, shift.id, b);
    expect(() => claimShift(team, shift.id, a)).toThrow();
  });
  it("blocks releasing or confirming a shift that isn't claimed", () => {
    const { team, a } = teamWithTwoMembers();
    const shift = postShift(team, { day: 0, start: "09:00", end: "10:00", note: "", postedBy: a });
    expect(() => releaseShift(team, shift.id)).toThrow();
    expect(() => confirmShift(team, shift.id)).toThrow();
  });
  it("cancels open and claimed shifts but blocks confirmed ones", () => {
    const { team, a, b } = teamWithTwoMembers();
    const open = postShift(team, { day: 0, start: "09:00", end: "10:00", note: "", postedBy: a });
    cancelShift(team, open.id);
    expect(team.shifts).toHaveLength(0);
    const claimed = postShift(team, { day: 0, start: "09:00", end: "10:00", note: "", postedBy: a });
    claimShift(team, claimed.id, b);
    cancelShift(team, claimed.id);
    expect(team.shifts).toHaveLength(0);
    const confirmed = postShift(team, { day: 0, start: "09:00", end: "10:00", note: "", postedBy: a });
    claimShift(team, confirmed.id, b);
    confirmShift(team, confirmed.id);
    expect(() => cancelShift(team, confirmed.id)).toThrow();
  });
});

describe("weekCoverage", () => {
  it("defaults to a full ratio with no shifts", () => {
    expect(weekCoverage([])).toEqual({ total: 0, open: 0, claimed: 0, confirmed: 0, ratio: 1 });
  });
  it("tallies status counts and a coverage ratio", () => {
    const { team, a, b } = teamWithTwoMembers();
    const s1 = postShift(team, { day: 0, start: "09:00", end: "10:00", note: "", postedBy: a });
    postShift(team, { day: 1, start: "09:00", end: "10:00", note: "", postedBy: a });
    const s3 = postShift(team, { day: 2, start: "09:00", end: "10:00", note: "", postedBy: a });
    claimShift(team, s1.id, b);
    confirmShift(team, s1.id);
    claimShift(team, s3.id, b);
    const coverage = weekCoverage(team.shifts);
    expect(coverage).toEqual({ total: 3, open: 1, claimed: 1, confirmed: 1, ratio: 2 / 3 });
  });
});

describe("weekDates", () => {
  it("returns Monday..Sunday for a mid-week reference", () => {
    const dates = weekDates(new Date(2026, 9, 22)); // Thursday Oct 22 2026
    expect(dates.map((d) => d.getDate())).toEqual([19, 20, 21, 22, 23, 24, 25]);
    expect(dates[0].getDay()).toBe(1);
    expect(dates[6].getDay()).toBe(0);
  });
  it("returns the same week for a Sunday reference", () => {
    const dates = weekDates(new Date(2026, 9, 25)); // Sunday Oct 25 2026
    expect(dates.map((d) => d.getDate())).toEqual([19, 20, 21, 22, 23, 24, 25]);
  });
});

describe("load / save", () => {
  it("round-trips valid data", () => {
    const { team } = teamWithTwoMembers();
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(save([team], storage)).toBe(true);
    const loaded = load(storage);
    expect(loaded).toEqual([team]);
  });
  it("returns an empty list for missing, malformed, or mismatched-version data", () => {
    const missing = { getItem: () => null };
    expect(load(missing)).toEqual([]);
    const badJson = { getItem: () => "{not json" };
    expect(load(badJson)).toEqual([]);
    const wrongVersion = { getItem: () => JSON.stringify({ schemaVersion: 2, teams: [] }) };
    expect(load(wrongVersion)).toEqual([]);
  });
  it("rejects duplicate team ids and structurally invalid teams", () => {
    const { team } = teamWithTwoMembers();
    const dup = { getItem: () => JSON.stringify({ schemaVersion: 1, teams: [team, team] }) };
    expect(load(dup)).toEqual([]);
    const badMember = { getItem: () => JSON.stringify({ schemaVersion: 1, teams: [{ ...team, members: [{ id: "x" }] }] }) };
    expect(load(badMember)).toEqual([]);
    const dupMemberIds = {
      getItem: () =>
        JSON.stringify({ schemaVersion: 1, teams: [{ ...team, members: [{ id: "x", name: "A" }, { id: "x", name: "B" }] }] }),
    };
    expect(load(dupMemberIds)).toEqual([]);
  });
  it("rejects shifts with bad fields or inconsistent claim state", () => {
    const { team, a } = teamWithTwoMembers();
    const shift = postShift(team, { day: 0, start: "09:00", end: "10:00", note: "", postedBy: a });
    const badDay = { getItem: () => JSON.stringify({ schemaVersion: 1, teams: [{ ...team, shifts: [{ ...shift, day: 9 }] }] }) };
    expect(load(badDay)).toEqual([]);
    const badTime = { getItem: () => JSON.stringify({ schemaVersion: 1, teams: [{ ...team, shifts: [{ ...shift, start: "9:00" }] }] }) };
    expect(load(badTime)).toEqual([]);
    const unknownPoster = { getItem: () => JSON.stringify({ schemaVersion: 1, teams: [{ ...team, shifts: [{ ...shift, postedBy: "ghost" }] }] }) };
    expect(load(unknownPoster)).toEqual([]);
    const inconsistent = { getItem: () => JSON.stringify({ schemaVersion: 1, teams: [{ ...team, shifts: [{ ...shift, status: "claimed", claimedBy: null }] }] }) };
    expect(load(inconsistent)).toEqual([]);
    const selfClaim = { getItem: () => JSON.stringify({ schemaVersion: 1, teams: [{ ...team, shifts: [{ ...shift, status: "claimed", claimedBy: a }] }] }) };
    expect(load(selfClaim)).toEqual([]);
    const dupShiftIds = { getItem: () => JSON.stringify({ schemaVersion: 1, teams: [{ ...team, shifts: [shift, shift] }] }) };
    expect(load(dupShiftIds)).toEqual([]);
  });
  it("reports storage failures without throwing", () => {
    const throwing = {
      setItem: () => {
        throw Error("denied");
      },
    };
    expect(save([], throwing)).toBe(false);
  });
});
