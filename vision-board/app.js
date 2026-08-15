// ===== tiny API helper =====
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers }
  });
  if (res.status === 401) {
    window.location.href = "/login.html";
    throw new Error("Not signed in");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

// ===== state =====
let state = { projects: [], notes: [], activity: [], sessionsInbox: [], usage: null, search: "" };

// ===== formatting helpers =====
const money = (n) =>
  n || n === 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n) : null;

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function healthMeta(health) {
  if (health === "Watch") return { cls: "watch", label: "Watch" };
  if (health === "Blocked") return { cls: "blocked", label: "Blocked" };
  return { cls: "on-track", label: "On track" };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function nl2br(s) {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

function matchesSearch(project) {
  if (!state.search) return true;
  const haystack = [project.name, project.winning, project.nextMove, project.blockers, project.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(state.search);
}
function noteMatchesSearch(note) {
  if (!state.search) return true;
  return (note.note || "").toLowerCase().includes(state.search);
}

// ===== render =====
function render() {
  renderGlance();
  renderInbox();
  renderPresent();
  renderFuture();
  renderNotes();
  renderActivity();
}

function renderInbox() {
  const list = document.getElementById("inboxList");
  const items = state.sessionsInbox;
  if (!items.length) {
    list.innerHTML = `<div class="empty">Nothing stuck right now — every session either shipped or is still actively running.</div>`;
    return;
  }
  list.innerHTML = items
    .map((s) => {
      const days = Math.max(0, Math.floor((Date.now() - new Date(s.lastActive).getTime()) / 86400000));
      return `
      <div class="frow">
        <div class="frow-main">
          <h4>${escapeHtml(s.title)} <span class="pill ${s.status === "Blocked" ? "blocked" : "watch"}"><span class="dot"></span>${escapeHtml(s.status)}</span></h4>
          <p>${escapeHtml(s.needsAction)}</p>
          <p style="color:var(--muted);font-size:11.5px;margin-top:4px">Waiting ${days} day${days === 1 ? "" : "s"}</p>
        </div>
      </div>`;
    })
    .join("");
}

function renderGlance() {
  const present = state.projects.filter((p) => p.section === "Present");
  const future = state.projects.filter((p) => p.section === "Future");
  const attention = present.filter((p) => p.health === "Watch" || p.health === "Blocked").length;

  document.getElementById("todayDate").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  document.getElementById("glance").innerHTML = `
    <div class="glance-chip"><span class="n">${present.length}</span><span class="l">present builds</span></div>
    <div class="glance-chip"><span class="n">${future.length}</span><span class="l">future ideas</span></div>
    <div class="glance-chip ${attention ? "alert" : ""}"><span class="n">${attention}</span><span class="l">need attention</span></div>
    ${usageChipHtml()}
  `;
}

function timeUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.round(min / 60)}h`;
}

// Best-effort: reads Claude Code session metadata as a proxy for account
// usage (see api/usage.js), not an official usage meter -- the tooltip
// says so plainly, but "approaching"/"blocked" still alert visually since
// that's the whole point of tracking this.
function usageChipHtml() {
  const u = state.usage;
  if (!u) return "";
  const label = u.status === "allowed" ? "Claude usage OK" : u.status === "approaching" ? "Claude usage: near limit" : "Claude usage: blocked";
  return `<div class="glance-chip ${u.status !== "allowed" ? "alert" : ""}" title="Best-effort proxy, checked ${relTime(u.checkedAt)} -- not an official usage meter">
    <span class="n" style="font-size:14px">${escapeHtml(label)}</span>
    <span class="l">resets in ${timeUntil(u.resetsAt)}</span>
  </div>`;
}

// Groups items by parentCompany (exact name match to another project on the
// board). Grouped clusters come first (alphabetical by parent name),
// standalone items (no parent set) come last with no heading.
function groupByParent(items) {
  const groups = new Map();
  const standalone = [];
  for (const p of items) {
    const parent = (p.parentCompany || "").trim();
    if (!parent) {
      standalone.push(p);
      continue;
    }
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(p);
  }
  const ordered = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, groupItems]) => ({ label, items: groupItems }));
  if (standalone.length) ordered.push({ label: null, items: standalone });
  return ordered;
}

function presentCard(p) {
  const h = healthMeta(p.health);
  const cur = money(p.currentRevenue);
  const tgt = money(p.targetRevenue);
  return `
  <div class="pcard health-${h.cls}" data-id="${p.id}">
    <div class="pcard-top">
      <h3>${escapeHtml(p.name)}</h3>
      <span class="pill ${h.cls}"><span class="dot"></span>${h.label}</span>
    </div>
    ${p.winning ? `<div class="pcard-row"><div class="pcard-label">Winning looks like</div><div class="pcard-text">${nl2br(p.winning)}</div></div>` : ""}
    ${p.nextMove ? `<div class="pcard-row"><div class="pcard-label">Next move</div><div class="pcard-text">${nl2br(p.nextMove)}</div></div>` : ""}
    ${p.blockers && p.blockers !== "None noted yet." ? `<div class="pcard-row"><div class="pcard-label">Blocking it</div><div class="pcard-text">${nl2br(p.blockers)}</div></div>` : ""}
    ${
      cur || tgt
        ? `<div class="pcard-financials">
            ${cur ? `<div class="fin-block"><div class="n">${cur}/mo</div><div class="l">current</div></div>` : ""}
            ${tgt ? `<div class="fin-block"><div class="n">${tgt}/mo</div><div class="l">target</div></div>` : ""}
          </div>`
        : ""
    }
    <div class="pcard-actions">
      ${p.ceoViewUrl ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(p.ceoViewUrl)}">CEO View →</a>` : ""}
      <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${p.id}">Edit</button>
      <button class="btn btn-danger btn-sm" data-action="delete" data-id="${p.id}">Delete</button>
    </div>
  </div>`;
}

function renderPresent() {
  const grid = document.getElementById("presentGrid");
  const items = state.projects.filter((p) => p.section === "Present" && matchesSearch(p));

  if (!items.length) {
    grid.innerHTML = `<div class="empty">${
      state.search ? "Nothing in Present Builds matches that search." : "No present builds yet. Click “+ New present build” to add the first thing you're actually working on."
    }</div>`;
    return;
  }

  grid.innerHTML = groupByParent(items)
    .map(
      (group) => `
      ${group.label ? `<div class="group-label">${escapeHtml(group.label)}</div>` : ""}
      <div class="card-grid" style="margin-bottom:16px">${group.items.map(presentCard).join("")}</div>`
    )
    .join("");
}

function futureRow(p) {
  return `
  <div class="frow" data-id="${p.id}">
    <div class="frow-main">
      <h4>${escapeHtml(p.name)}</h4>
      ${p.winning ? `<p>${escapeHtml(p.winning)}</p>` : ""}
    </div>
    <div class="frow-actions">
      <button class="btn btn-primary btn-sm" data-action="promote" data-id="${p.id}">Promote →</button>
      <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${p.id}">Edit</button>
      <button class="btn btn-danger btn-sm" data-action="delete" data-id="${p.id}">Delete</button>
    </div>
  </div>`;
}

function renderFuture() {
  const list = document.getElementById("futureList");
  const items = state.projects.filter((p) => p.section === "Future" && matchesSearch(p));

  if (!items.length) {
    list.innerHTML = `<div class="empty">${
      state.search ? "Nothing in Future Builds matches that search." : "No future ideas yet. Click “+ New idea” to start carrying it here instead of just in your head."
    }</div>`;
    return;
  }

  list.innerHTML = groupByParent(items)
    .map(
      (group) => `
      ${group.label ? `<div class="group-label">${escapeHtml(group.label)}</div>` : ""}
      <div class="future-list" style="margin-bottom:16px">${group.items.map(futureRow).join("")}</div>`
    )
    .join("");
}

function renderNotes() {
  const list = document.getElementById("noteList");
  const items = state.notes.filter(noteMatchesSearch);

  if (!items.length) {
    list.innerHTML = `<div class="empty">${state.search ? "No scratchpad notes match that search." : "Nothing dumped here yet."}</div>`;
    return;
  }

  list.innerHTML = items
    .map(
      (n) => `
      <div class="note ${n.pinned ? "pinned" : ""}" data-id="${n.id}">
        <div style="flex:1">
          <div class="note-text">${nl2br(n.note)}</div>
          <div class="note-meta">${relTime(n.createdTime)}</div>
        </div>
        <div class="note-actions">
          <button class="icon-btn" data-action="pin" data-id="${n.id}" title="${n.pinned ? "Unpin" : "Pin"}">${n.pinned ? "★" : "☆"}</button>
          <button class="icon-btn" data-action="deleteNote" data-id="${n.id}" title="Delete">✕</button>
        </div>
      </div>`
    )
    .join("");
}

function renderActivity() {
  const list = document.getElementById("activityList");
  if (!state.activity.length) {
    list.innerHTML = `<div class="empty">Nothing logged yet — every add, edit, promotion, and note will show up here automatically.</div>`;
    return;
  }
  list.innerHTML = state.activity
    .map(
      (a) => `
      <div class="arow">
        <div class="atype">${escapeHtml(a.type || "")}</div>
        <div class="amsg">${escapeHtml(a.message)}</div>
        <div class="awhen">${relTime(a.createdTime)}</div>
      </div>`
    )
    .join("");
}

// ===== data loading =====
async function loadAll() {
  const [projects, notes, activity, sessionsInbox, usage] = await Promise.all([
    api("/api/projects"),
    api("/api/notes"),
    api("/api/activity"),
    api("/api/sessions-inbox"),
    api("/api/usage")
  ]);
  state.projects = projects;
  state.notes = notes;
  state.activity = activity;
  state.sessionsInbox = sessionsInbox;
  state.usage = usage;
  render();
}

// ===== project modal =====
const projectModal = document.getElementById("projectModal");
const projectForm = document.getElementById("projectForm");

function openProjectModal({ project = null, section = "Present" } = {}) {
  document.getElementById("projectModalTitle").textContent = project
    ? `Edit ${project.name}`
    : section === "Present"
    ? "New present build"
    : "New future idea";
  document.getElementById("projectId").value = project?.id || "";
  document.getElementById("projectSection").value = project?.section || section;
  document.getElementById("pName").value = project?.name || "";
  document.getElementById("pParentCompany").value = project?.parentCompany || "";
  document.getElementById("pWinning").value = project?.winning || "";
  document.getElementById("pNextMove").value = project?.nextMove || "";
  document.getElementById("pBlockers").value = project?.blockers || "";
  document.getElementById("pHealth").value = project?.health || "On track";
  document.getElementById("pCurrentRevenue").value = project?.currentRevenue ?? "";
  document.getElementById("pTargetRevenue").value = project?.targetRevenue ?? "";
  document.getElementById("pNotes").value = project?.notes || "";

  const isPresent = (project?.section || section) === "Present";
  document.getElementById("presentOnlyFields").style.display = isPresent ? "block" : "none";

  projectModal.classList.remove("hidden");
}
function closeProjectModal() {
  projectModal.classList.add("hidden");
}

document.getElementById("addPresentBtn").addEventListener("click", () => openProjectModal({ section: "Present" }));
document.getElementById("addFutureBtn").addEventListener("click", () => openProjectModal({ section: "Future" }));
document.getElementById("projectCancelBtn").addEventListener("click", closeProjectModal);

projectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("projectId").value;
  const section = document.getElementById("projectSection").value;
  const body = {
    name: document.getElementById("pName").value.trim(),
    section,
    parentCompany: document.getElementById("pParentCompany").value.trim(),
    winning: document.getElementById("pWinning").value.trim(),
    currentRevenue: document.getElementById("pCurrentRevenue").value === "" ? null : Number(document.getElementById("pCurrentRevenue").value),
    targetRevenue: document.getElementById("pTargetRevenue").value === "" ? null : Number(document.getElementById("pTargetRevenue").value),
    notes: document.getElementById("pNotes").value.trim()
  };
  if (section === "Present") {
    body.nextMove = document.getElementById("pNextMove").value.trim();
    body.blockers = document.getElementById("pBlockers").value.trim();
    body.health = document.getElementById("pHealth").value;
  }

  const saveBtn = document.getElementById("projectSaveBtn");
  saveBtn.disabled = true;
  try {
    if (id) {
      await api("/api/projects", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
    } else {
      await api("/api/projects", { method: "POST", body: JSON.stringify(body) });
    }
    closeProjectModal();
    await loadAll();
  } catch (err) {
    alert(err.message);
  }
  saveBtn.disabled = false;
});

// ===== confirm modal (delete) =====
const confirmModal = document.getElementById("confirmModal");
function openConfirm({ title, body, actions }) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmBody").textContent = body;
  const actionsEl = document.getElementById("confirmActions");
  actionsEl.innerHTML = "";
  actions.forEach(({ label, cls, onClick }) => {
    const btn = document.createElement("button");
    btn.className = `btn ${cls}`;
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      confirmModal.classList.add("hidden");
      await onClick();
    });
    actionsEl.appendChild(btn);
  });
  confirmModal.classList.remove("hidden");
}

// ===== card/row action delegation =====
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === "edit") {
    const project = state.projects.find((p) => p.id === id);
    openProjectModal({ project });
  }

  if (action === "promote") {
    await api("/api/projects", { method: "PATCH", body: JSON.stringify({ id, section: "Present" }) });
    await loadAll();
  }

  if (action === "delete") {
    const project = state.projects.find((p) => p.id === id);
    openConfirm({
      title: `Remove "${project.name}"?`,
      body: project.section === "Present" ? "Was this finished, or are you just clearing it off the board?" : "This will remove the idea from Future Builds.",
      actions:
        project.section === "Present"
          ? [
              { label: "Cancel", cls: "btn-ghost", onClick: () => {} },
              {
                label: "Just remove it",
                cls: "btn-ghost",
                onClick: async () => {
                  await api("/api/projects", { method: "DELETE", body: JSON.stringify({ id }) });
                  await loadAll();
                }
              },
              {
                label: "Mark completed",
                cls: "btn-primary",
                onClick: async () => {
                  await api("/api/projects", { method: "DELETE", body: JSON.stringify({ id, reason: "completed" }) });
                  await loadAll();
                }
              }
            ]
          : [
              { label: "Cancel", cls: "btn-ghost", onClick: () => {} },
              {
                label: "Delete",
                cls: "btn-danger",
                onClick: async () => {
                  await api("/api/projects", { method: "DELETE", body: JSON.stringify({ id }) });
                  await loadAll();
                }
              }
            ]
    });
  }

  if (action === "pin") {
    const note = state.notes.find((n) => n.id === id);
    await api("/api/notes", { method: "PATCH", body: JSON.stringify({ id, pinned: !note.pinned }) });
    await loadAll();
  }

  if (action === "deleteNote") {
    if (!confirm("Delete this scratchpad note? This can't be undone.")) return;
    await api("/api/notes", { method: "DELETE", body: JSON.stringify({ id }) });
    await loadAll();
  }
});

// ===== scratchpad add =====
document.getElementById("addNoteBtn").addEventListener("click", async () => {
  const input = document.getElementById("noteInput");
  const text = input.value.trim();
  if (!text) return;
  await api("/api/notes", { method: "POST", body: JSON.stringify({ note: text }) });
  input.value = "";
  await loadAll();
});

// ===== search =====
document.getElementById("searchInput").addEventListener("input", (e) => {
  state.search = e.target.value.trim().toLowerCase();
  renderPresent();
  renderFuture();
  renderNotes();
});

// ===== sidebar scrollspy =====
const navLinks = Array.from(document.querySelectorAll("[data-nav]"));
const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href")));
const spy = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = "#" + entry.target.id;
      navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === id));
    });
  },
  { rootMargin: "-35% 0px -55% 0px" }
);
sections.forEach((s) => s && spy.observe(s));

// ===== logout =====
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
});

// ===== boot =====
loadAll().catch((err) => {
  console.error(err);
});
