import "./style.css";
import {
  DAYS,
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
} from "./model";
import type { Shift, Team } from "./model";

import {
  canAddMember,
  canCreateTeam,
  canPostShift,
  isEntitled,
  loadLicense,
  saveLicense,
  verifyLicense,
} from "./license";
import type { LicenseState } from "./license";

let license: LicenseState = null;
try {
  license = await loadLicense(localStorage);
} catch {
  /* Storage denied: free tier. */
}

const app = document.querySelector<HTMLDivElement>("#app")!;
let teams: Team[] = [];
try {
  teams = load(localStorage);
} catch {
  /* Storage may be disabled by browser policy. */
}
let activeId = "",
  screen: "teams" | "board" | "settings" = "teams",
  actingMemberId: string | null = null;
let notice = "";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const team = () => teams.find((t) => t.id === activeId);
const STATUS_LABEL: Record<Shift["status"], string> = {
  open: "Needs cover",
  claimed: "Pending confirm",
  confirmed: "Covered",
};

function persist(message = "Saved on this device") {
  try {
    notice = save(teams, localStorage) ? message : "Could not save: storage is unavailable or full. Keep this tab open.";
  } catch {
    notice = "Storage is unavailable. Changes are only in this tab.";
  }
}
function limitCheck(ok: boolean, message: string): boolean {
  if (ok) return true;
  notice = message;
  render();
  return false;
}
function shell(content: string) {
  app.innerHTML = `<header class="app-header"><a class="brand" href="#" data-action="home"><span class="brand-mark">C<span>⇄</span></span>CoverBoard<span class="beta">OPEN SHIFT BOARD</span></a><nav aria-label="Main navigation"><button data-action="home" class="${screen === "teams" ? "active" : ""}">My teams</button>${
    screen !== "teams"
      ? `<button data-action="board" class="${screen === "board" ? "active" : ""}">Shift board</button><button data-action="settings" class="${screen === "settings" ? "active" : ""}">Team settings</button>`
      : ""
  }<button data-action="license">Enter license key</button></nav><span class="local-badge">● Local & offline</span></header><main>${content}</main><footer><span>POST IT. CLAIM IT. COVERED.</span><span>Built for the break room. Saved on your device.</span></footer><div class="toast" role="status" aria-live="polite">${esc(notice)}</div>`;
}

function dashboard() {
  shell(
    `<section class="page-heading"><div><p class="eyebrow">YOUR CREWS</p><h1>Stop chasing the<br>group chat<span class="accent">.</span></h1><p class="intro">Post the shift you can't cover. Whoever can take it, claims it. Everyone sees where things stand.</p></div><div class="heading-note"><strong>No more "can anyone<br>cover this?" into the void.</strong><span>Open, pending, covered — one board.</span></div></section><div class="dashboard-grid"><section><div class="section-title"><h2>My teams <span class="count">${teams.length}</span></h2><span>This device only</span></div>${
      teams.length
        ? `<div class="team-grid">${teams
            .map((t) => {
              const cov = weekCoverage(t.shifts);
              return `<article class="team-card"><div class="team-emblem">${esc(t.name.slice(0, 2).toUpperCase())}</div><p class="eyebrow">${t.members.length} member${t.members.length === 1 ? "" : "s"}</p><h3>${esc(t.name)}</h3><p>${cov.open} needs cover <span class="separator">/</span> ${cov.claimed} pending <span class="separator">/</span> ${cov.confirmed} covered</p><div class="card-actions"><button class="primary" data-open="${t.id}">Open board ↗</button><button class="quiet danger" data-delete-team="${t.id}" aria-label="Delete ${esc(t.name)}">Delete</button></div></article>`;
            })
            .join("")}</div>`
        : `<div class="empty"><div class="empty-symbol">＋</div><h3>Your first board starts here</h3><p>Create a team, add your crew, and post the<br>first shift that needs covering.</p><span>01 CREATE TEAM → 02 ADD CREW → 03 POST A SHIFT</span></div>`
    }</section><aside class="panel create-panel"><p class="eyebrow">A FRESH START</p><h2>Create a team</h2><form id="create-team"><label>Team name<input name="name" placeholder="e.g. Riverside Diner" maxlength="60" required></label><button class="primary full" type="submit">Create team <span>＋</span></button></form><p class="small">No account. No setup. Your board stays in this browser.</p></aside></div>`,
  );
}

function licenseSection() {
  return `<section class="panel"><h2>License & tier</h2><p data-tier>Current tier: ${
    isEntitled(license, "paid")
      ? "Paid — unlimited teams, roster size, and open shifts"
      : "Free — 1 team, 4 crew members per team, 3 open shift requests per team"
  }</p><form id="license"><label>License key<textarea name="key" rows="3" required spellcheck="false"></textarea></label><button class="primary" type="submit">Apply license</button></form><button data-action="remove-license">Remove license key</button><p class="small">Demo licensing only. Removing a key preserves every team, member, and shift already on the board.</p></section>`;
}

function shiftCard(t: Team, s: Shift) {
  const poster = t.members.find((m) => m.id === s.postedBy);
  const claimer = s.claimedBy ? t.members.find((m) => m.id === s.claimedBy) : null;
  const mine = actingMemberId;
  const actions: string[] = [];
  if (s.status === "open") {
    if (mine && mine !== s.postedBy) actions.push(`<button class="primary" data-claim="${s.id}">Claim shift</button>`);
    if (mine && mine === s.postedBy) actions.push(`<button class="quiet danger" data-cancel="${s.id}">Cancel</button>`);
  } else if (s.status === "claimed") {
    if (mine && mine === s.claimedBy) actions.push(`<button data-release="${s.id}">Release claim</button>`);
    if (mine && (mine === s.postedBy || mine === s.claimedBy))
      actions.push(`<button class="primary" data-confirm="${s.id}">Confirm covered</button>`);
    if (mine && mine === s.postedBy) actions.push(`<button class="quiet danger" data-cancel="${s.id}">Cancel</button>`);
  }
  return `<article class="shift-card status-${s.status}"><div class="shift-time">${s.start}–${s.end}</div><span class="status-badge ${s.status}">${STATUS_LABEL[s.status]}</span>${
    s.note ? `<p class="shift-note">${esc(s.note)}</p>` : ""
  }<p class="shift-meta">Posted by <strong>${esc(poster?.name ?? "—")}</strong></p>${
    claimer ? `<p class="shift-meta">Claimed by <strong>${esc(claimer.name)}</strong></p>` : ""
  }${actions.length ? `<div class="shift-actions">${actions.join("")}</div>` : ""}</article>`;
}

function board() {
  const t = team();
  if (!t) {
    screen = "teams";
    dashboard();
    return;
  }
  if (actingMemberId && !t.members.some((m) => m.id === actingMemberId)) actingMemberId = null;
  if (!actingMemberId && t.members.length) actingMemberId = t.members[0].id;
  const dates = weekDates();
  const cov = weekCoverage(t.shifts);
  const activeCount = t.shifts.filter((s) => s.status !== "confirmed").length;
  const pct = (n: number) => (cov.total ? (n / cov.total) * 100 : 0);
  shell(
    `<section class="board-heading"><div><p class="eyebrow"><button class="text-button" data-action="home">MY TEAMS</button> / SHIFT BOARD</p><h1>${esc(t.name)}</h1></div><div class="toolbar"><label class="sr-only" for="acting-member">Acting as</label><select id="acting-member" aria-label="Acting as"><option value="">Acting as…</option>${t.members
      .map((m) => `<option value="${m.id}" ${m.id === actingMemberId ? "selected" : ""}>${esc(m.name)}</option>`)
      .join("")}</select><button data-action="settings">Manage roster</button></div></section><section class="panel coverage-panel" aria-label="Week coverage"><div class="section-title"><h2>This week's coverage</h2><span>${cov.total} shift${cov.total === 1 ? "" : "s"} posted</span></div><div class="coverage-bar"><span class="seg confirmed" style="--w:${pct(cov.confirmed)}%"></span><span class="seg claimed" style="--w:${pct(cov.claimed)}%"></span><span class="seg open" style="--w:${pct(cov.open)}%"></span></div><div class="legend"><span class="open">● ${cov.open} needs cover</span><span class="claimed">● ${cov.claimed} pending confirm</span><span class="confirmed">● ${cov.confirmed} covered</span></div></section><div class="board-grid"><section class="week-panel"><div class="week-columns">${dates
      .map((date, i) => {
        const dayShifts = t.shifts.filter((s) => s.day === i).sort((a, b) => a.start.localeCompare(b.start));
        return `<div class="day-column"><div class="day-header"><strong>${DAYS[i]}</strong><span>${date.getMonth() + 1}/${date.getDate()}</span></div><div class="day-shifts">${
          dayShifts.length ? dayShifts.map((s) => shiftCard(t, s)).join("") : '<p class="day-empty">No shifts posted</p>'
        }</div></div>`;
      })
      .join("")}</div></section><aside class="panel post-panel"><div class="section-title"><h2>Post an open shift</h2></div>${
      t.members.length
        ? `<form id="post-shift"><label>Day<select name="day">${dates
            .map((date, i) => `<option value="${i}">${DAYS[i]} ${date.getMonth() + 1}/${date.getDate()}</option>`)
            .join("")}</select></label><div class="input-pair"><label>Start<input type="time" name="start" required value="09:00"></label><label>End<input type="time" name="end" required value="17:00"></label></div><label>Note<input name="note" maxlength="140" placeholder="e.g. Register closing shift"></label><button class="primary full" type="submit" ${actingMemberId ? "" : "disabled"}>Post shift ＋</button></form>${
            actingMemberId ? "" : `<p class="small">Choose who you're acting as above to post a shift.</p>`
          }<p class="small">Free tier: 3 open requests per team at a time. ${activeCount}/3 in use${isEntitled(license, "paid") ? " — unlimited on your paid plan" : ""}.</p>`
        : `<p class="small">Add crew members in settings before posting a shift.</p><button data-action="settings">Add members →</button>`
    }</aside></div>`,
  );
}

function settings() {
  const t = team();
  if (!t) {
    shell(licenseSection());
    return;
  }
  shell(
    `<section class="page-heading compact"><div><p class="eyebrow">TEAM SETTINGS</p><h1>Keep the roster<br>up to date<span class="accent">.</span></h1><p class="intro">${esc(t.name)} · Rename the team, or manage who's on the board.</p></div><button data-action="board">← Back to board</button></section>${licenseSection()}<div class="settings-grid"><section class="panel"><h2>Team name</h2><form id="rename-team"><label>Name<input name="name" value="${esc(t.name)}" maxlength="60" required></label><button class="primary" type="submit">Save name</button></form><h2>Danger zone</h2><p class="small">Deletes this team and its entire shift board. Cannot be undone.</p><button class="danger" data-delete-team="${t.id}">Delete this team</button></section><section class="panel"><div class="section-title"><h2>Roster <span class="count">${t.members.length}</span></h2><span>Free tier: 4 per team</span></div><form id="add-member"><label>Add crew members<textarea name="names" rows="3" placeholder="Ada&#10;Bo, Cy" required></textarea></label><p class="small">One name per line, or separate names with commas.</p><button class="primary" type="submit">Add members</button></form><div class="roster-list">${
      t.members
        .map(
          (m) =>
            `<div class="roster-row"><span>${esc(m.name)}</span><button class="quiet danger" data-remove-member="${m.id}" aria-label="Remove ${esc(m.name)}">Remove</button></div>`,
        )
        .join("") || '<p class="small">No crew members yet. Add your team above.</p>'
    }</div></section></div>`,
  );
}

function render() {
  if (screen === "teams") dashboard();
  else if (screen === "settings") settings();
  else board();
}

app.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("button,a");
  if (!el) return;
  const d = el.dataset;
  if (d.open) {
    activeId = d.open;
    actingMemberId = null;
    screen = "board";
    notice = "";
    render();
    return;
  }
  if (d.deleteTeam) {
    if (confirm("Delete this team and its entire shift board?")) {
      teams = teams.filter((t) => t.id !== d.deleteTeam);
      if (activeId === d.deleteTeam) {
        activeId = "";
        screen = "teams";
      }
      persist("Team deleted");
      render();
    }
    return;
  }
  if (d.claim) {
    if (!actingMemberId) {
      notice = "Choose who you're acting as first.";
      render();
      return;
    }
    try {
      claimShift(team()!, d.claim, actingMemberId);
      persist("Shift claimed");
    } catch (err) {
      notice = (err as Error).message;
    }
    render();
    return;
  }
  if (d.release) {
    try {
      releaseShift(team()!, d.release);
      persist("Shift released back to open");
    } catch (err) {
      notice = (err as Error).message;
    }
    render();
    return;
  }
  if (d.confirm) {
    try {
      confirmShift(team()!, d.confirm);
      persist("Shift confirmed covered");
    } catch (err) {
      notice = (err as Error).message;
    }
    render();
    return;
  }
  if (d.cancel) {
    const shift = team()!.shifts.find((s) => s.id === d.cancel);
    if (shift?.status === "claimed" && !confirm("This shift has a claim on it. Cancel it anyway?")) return;
    try {
      cancelShift(team()!, d.cancel);
      persist("Shift cancelled");
    } catch (err) {
      notice = (err as Error).message;
    }
    render();
    return;
  }
  if (d.removeMember) {
    if (confirm("Remove this member? Their open shifts are cancelled and their claims are released.")) {
      removeMember(team()!, d.removeMember);
      if (actingMemberId === d.removeMember) actingMemberId = null;
      persist("Member removed");
      render();
    }
    return;
  }
  switch (d.action) {
    case "home":
      e.preventDefault();
      screen = "teams";
      notice = "";
      render();
      break;
    case "board":
      screen = team() ? "board" : "teams";
      render();
      break;
    case "license":
    case "settings":
      screen = "settings";
      render();
      break;
    case "remove-license":
      license = null;
      try {
        notice = saveLicense(null, localStorage)
          ? "License removed. Free tier limits restored; your board is untouched."
          : "Key removed for this tab only: storage unavailable.";
      } catch {
        notice = "Key removed for this tab only: storage unavailable.";
      }
      render();
      break;
  }
});

app.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement,
    data = new FormData(form),
    value = (key: string) => String(data.get(key) ?? "").trim();
  if (form.id === "license") {
    const next = await verifyLicense(value("key"));
    if (!next) {
      notice = "Invalid or expired license key. Current tier unchanged.";
      render();
      return;
    }
    license = next;
    try {
      notice = saveLicense(license, localStorage) ? "Paid license applied." : "Paid license applied for this tab only: storage unavailable.";
    } catch {
      notice = "Paid license applied for this tab only: storage unavailable.";
    }
    render();
    return;
  }
  if (form.id === "create-team") {
    if (!limitCheck(canCreateTeam(license, teams.length), "Free tier limit: 1 team. Enter a license key to unlock unlimited teams.")) return;
    if (!value("name")) return;
    const t = createTeam(value("name"));
    teams.push(t);
    activeId = t.id;
    actingMemberId = null;
    screen = "board";
  } else if (form.id === "rename-team") {
    if (!value("name")) {
      notice = "Enter a team name.";
      render();
      return;
    }
    renameTeam(team()!, value("name"));
  } else if (form.id === "add-member") {
    const names = value("names")
      .split(/\n|,/)
      .map((n) => n.trim())
      .filter(Boolean);
    let added = 0;
    for (const name of names) {
      if (!canAddMember(license, team()!.members.length)) {
        persist(`Free tier limit: 4 members per team. Added ${added}; enter a license key to unlock unlimited roster size.`);
        render();
        return;
      }
      addMember(team()!, name);
      added++;
    }
  } else if (form.id === "post-shift") {
    if (!actingMemberId) {
      notice = "Choose who you're acting as first.";
      render();
      return;
    }
    const activeCount = team()!.shifts.filter((s) => s.status !== "confirmed").length;
    if (
      !limitCheck(
        canPostShift(license, activeCount),
        "Free tier limit: 3 open shift requests per team. Confirm or release an existing one, or enter a license key.",
      )
    )
      return;
    try {
      postShift(team()!, {
        day: Number(value("day")),
        start: value("start"),
        end: value("end"),
        note: value("note"),
        postedBy: actingMemberId,
      });
      notice = "Shift posted";
    } catch (err) {
      notice = (err as Error).message;
      render();
      return;
    }
  }
  persist();
  render();
});

app.addEventListener("change", (e) => {
  const el = e.target as HTMLSelectElement;
  if (el.id === "acting-member") {
    actingMemberId = el.value || null;
    render();
  }
});

render();
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    notice = "Offline setup failed. You can continue online.";
    render();
  });
