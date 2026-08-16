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
let state = { projects: [], notes: [], activity: [], sessionsInbox: [], usage: null, tasks: [], search: "" };

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

function statusMeta(status) {
  if (status === "On Hold") return { cls: "on-hold", label: "On Hold" };
  if (status === "Abandoned") return { cls: "abandoned", label: "Abandoned" };
  if (status === "Completed") return { cls: "completed", label: "Completed" };
  if (status === "New") return { cls: "new", label: "New" };
  return { cls: "active", label: "Active" };
}
const PROJECT_STATUSES = ["New", "Active", "On Hold", "Abandoned", "Completed"];

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
  renderPriorities();
  renderInbox();
  renderPresent();
  renderFuture();
  renderCompleted();
  renderNotes();
  renderActivity();
  renderCeoViewsNav();
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
  const attention = present.filter((p) => p.status === "On Hold" || (p.blockers && p.blockers.trim() && p.blockers !== "None noted yet.")).length;

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

// Top 3 Priorities: any non-completed build from anywhere on the board can
// be pinned into one of 3 slots via Priority Rank on its own record. Only
// one build holds a given rank at a time -- the API clears the previous
// holder when a new one is picked.
function renderPriorities() {
  const grid = document.getElementById("prioritiesGrid");
  const pickable = state.projects.filter((p) => p.section !== "Completed").sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = [1, 2, 3]
    .map((rank) => {
      const current = state.projects.find((p) => p.priorityRank === rank);
      const options = pickable
        .map((p) => `<option value="${p.id}" ${current?.id === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
        .join("");
      return `
      <div class="priority-slot">
        <div class="priority-rank">Priority ${rank}</div>
        <select data-action="setPriority" data-rank="${rank}">
          <option value="">— pick a build —</option>
          ${options}
        </select>
        ${
          current
            ? `<div class="priority-preview">
                ${current.nextMove ? `<div class="priority-next">${escapeHtml(current.nextMove)}</div>` : `<div class="priority-next" style="color:var(--muted)">No next move noted yet.</div>`}
              </div>`
            : ""
        }
      </div>`;
    })
    .join("");
}

// The company taxonomy David actually runs: fixed display order, with
// anything else (parked ideas, cross-company projects not yet sorted)
// falling into General rather than being left unlabeled.
const COMPANY_ORDER = ["Limitless Mortgage", "Limitless Capital", "Limitless Automated Systems", "Limitless Customers"];
const GENERAL_COMPANY = "General";

function groupByCompany(items) {
  const groups = new Map();
  for (const p of items) {
    const company = (p.parentCompany || "").trim() || GENERAL_COMPANY;
    if (!groups.has(company)) groups.set(company, []);
    groups.get(company).push(p);
  }
  const known = COMPANY_ORDER.filter((c) => groups.has(c)).map((label) => ({ label, items: groups.get(label) }));
  const extra = Array.from(groups.keys())
    .filter((k) => !COMPANY_ORDER.includes(k) && k !== GENERAL_COMPANY)
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ label, items: groups.get(label) }));
  const general = groups.has(GENERAL_COMPANY) ? [{ label: GENERAL_COMPANY, items: groups.get(GENERAL_COMPANY) }] : [];
  return [...known, ...extra, ...general];
}

// Collapsed company groups persist across reloads so "focus on one
// company" sticks instead of resetting every time the board loads.
const COLLAPSED_GROUPS_KEY = "vb-collapsed-groups";
function loadCollapsedGroups() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_GROUPS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveCollapsedGroups(set) {
  localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...set]));
}
const collapsedGroups = loadCollapsedGroups();

function renderGroupedSection(groups, itemRenderer, { sectionKey, wrapperClass }) {
  return groups
    .map((group) => {
      const groupKey = `${sectionKey}::${group.label}`;
      const collapsed = collapsedGroups.has(groupKey);
      return `
      <button type="button" class="group-header" data-toggle-group="${escapeHtml(groupKey)}" aria-expanded="${!collapsed}">
        <span class="group-chevron">${collapsed ? "▸" : "▾"}</span>
        <span class="group-label">${escapeHtml(group.label)}</span>
      </button>
      <div class="${wrapperClass}" style="margin-bottom:16px${collapsed ? ";display:none" : ""}">${group.items.map(itemRenderer).join("")}</div>`;
    })
    .join("");
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-toggle-group]");
  if (!btn) return;
  const key = btn.dataset.toggleGroup;
  const body = btn.nextElementSibling;
  const nowCollapsed = body.style.display !== "none";
  body.style.display = nowCollapsed ? "none" : "";
  btn.setAttribute("aria-expanded", String(!nowCollapsed));
  btn.querySelector(".group-chevron").textContent = nowCollapsed ? "▸" : "▾";
  if (nowCollapsed) collapsedGroups.add(key);
  else collapsedGroups.delete(key);
  saveCollapsedGroups(collapsedGroups);
});

function taskListHtml(businessId) {
  const tasks = state.tasks.filter((t) => t.businessId === businessId);
  const rows = tasks
    .map(
      (t) => `
    <label class="task-row ${t.done ? "task-done" : ""}">
      <input type="checkbox" data-action="toggleTask" data-id="${t.id}" ${t.done ? "checked" : ""}>
      <span>${escapeHtml(t.task)}</span>
      <button type="button" class="task-delete" data-action="deleteTask" data-id="${t.id}" title="Delete task">✕</button>
    </label>`
    )
    .join("");
  return `
  <div class="task-list" data-business-id="${businessId}">
    ${rows}
    <div class="task-add-row">
      <input type="text" class="task-add-input" data-business-id="${businessId}" placeholder="+ Add task">
    </div>
  </div>`;
}

function presentCard(p) {
  const s = statusMeta(p.status);
  const cur = money(p.currentRevenue);
  const tgt = money(p.targetRevenue);
  return `
  <div class="pcard status-${s.cls}" data-id="${p.id}">
    <div class="pcard-top">
      <h3>${escapeHtml(p.name)}</h3>
      <span class="pill ${s.cls}"><span class="dot"></span>${s.label}</span>
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
    <div class="pcard-row"><div class="pcard-label">Tasks</div>${taskListHtml(p.id)}</div>
    <div class="pcard-actions">
      ${p.ceoViewUrl ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(p.ceoViewUrl)}">CEO View →</a>` : ""}
      <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${p.id}">Edit</button>
      <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${p.id}">Complete / Remove</button>
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

  grid.innerHTML = renderGroupedSection(groupByCompany(items), presentCard, { sectionKey: "present", wrapperClass: "card-grid" });
}

function futureRow(p) {
  const s = statusMeta(p.status);
  return `
  <div class="frow" data-id="${p.id}">
    <div class="frow-main">
      <h4>${escapeHtml(p.name)} <span class="pill ${s.cls}"><span class="dot"></span>${s.label}</span></h4>
      ${p.winning ? `<p>${escapeHtml(p.winning)}</p>` : ""}
      ${taskListHtml(p.id)}
    </div>
    <div class="frow-actions">
      ${p.ceoViewUrl ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(p.ceoViewUrl)}">CEO View →</a>` : ""}
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

  list.innerHTML = renderGroupedSection(groupByCompany(items), futureRow, { sectionKey: "future", wrapperClass: "future-list" });
}

function completedRow(p) {
  return `
  <div class="frow" data-id="${p.id}">
    <div class="frow-main">
      <h4>${escapeHtml(p.name)}</h4>
      ${p.winning ? `<p>${escapeHtml(p.winning)}</p>` : ""}
    </div>
    <div class="frow-actions">
      <button class="btn btn-primary btn-sm" data-action="reopen" data-id="${p.id}">Reopen →</button>
      <button class="btn btn-danger btn-sm" data-action="deleteCompleted" data-id="${p.id}">Delete</button>
    </div>
  </div>`;
}

function renderCompleted() {
  const list = document.getElementById("completedList");
  const items = state.projects.filter((p) => p.section === "Completed" && matchesSearch(p));

  if (!items.length) {
    list.innerHTML = `<div class="empty">${
      state.search ? "Nothing in Completed Builds matches that search." : "Nothing marked completed yet — finished present builds land here."
    }</div>`;
    return;
  }

  list.innerHTML = renderGroupedSection(groupByCompany(items), completedRow, { sectionKey: "completed", wrapperClass: "future-list" });
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

// Builds the sidebar "CEO Views" tree from real project data: one
// collapsible entry per company, expanding to that company's projects.
// Only projects with a CEO View URL are clickable -- others show as plain
// text so it's clear no dashboard exists for them yet.
function renderCeoViewsNav() {
  const nav = document.getElementById("ceoViewsNav");
  const groups = groupByCompany(state.projects.filter((p) => p.section !== "Completed"));
  if (!groups.length) {
    nav.innerHTML = `<li style="padding:9px 10px;color:var(--muted);font-size:12.5px">No projects yet</li>`;
    return;
  }
  nav.innerHTML = groups
    .map((group) => {
      const rows = group.items
        .map((p) =>
          p.ceoViewUrl
            ? `<li><a href="${escapeHtml(p.ceoViewUrl)}">${escapeHtml(p.name)} <span class="ext">↗</span></a></li>`
            : `<li><span class="navlink-disabled">${escapeHtml(p.name)}</span></li>`
        )
        .join("");
      return `
      <li class="nav-company">
        <details open>
          <summary>${escapeHtml(group.label)}</summary>
          <ul class="navlinks nav-sublist">${rows}</ul>
        </details>
      </li>`;
    })
    .join("");
}

// ===== data loading =====
async function loadAll() {
  const [projects, notes, activity, sessionsInbox, usage, tasks] = await Promise.all([
    api("/api/projects"),
    api("/api/notes"),
    api("/api/activity"),
    api("/api/sessions-inbox"),
    api("/api/usage"),
    api("/api/tasks")
  ]);
  state.projects = projects;
  state.notes = notes;
  state.activity = activity;
  state.sessionsInbox = sessionsInbox;
  state.usage = usage;
  state.tasks = tasks;
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
  document.getElementById("pParentCompany").value = project?.parentCompany || "General";
  document.getElementById("pWinning").value = project?.winning || "";
  document.getElementById("pNextMove").value = project?.nextMove || "";
  document.getElementById("pBlockers").value = project?.blockers || "";
  document.getElementById("pStatus").value = project?.status || (section === "Future" ? "New" : "Active");
  document.getElementById("pCurrentRevenue").value = project?.currentRevenue ?? "";
  document.getElementById("pTargetRevenue").value = project?.targetRevenue ?? "";
  document.getElementById("pNotes").value = project?.notes || "";

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
    nextMove: document.getElementById("pNextMove").value.trim(),
    blockers: document.getElementById("pBlockers").value.trim(),
    status: document.getElementById("pStatus").value,
    currentRevenue: document.getElementById("pCurrentRevenue").value === "" ? null : Number(document.getElementById("pCurrentRevenue").value),
    targetRevenue: document.getElementById("pTargetRevenue").value === "" ? null : Number(document.getElementById("pTargetRevenue").value),
    notes: document.getElementById("pNotes").value.trim()
  };

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

  if (action === "promote" || action === "reopen") {
    await api("/api/projects", { method: "PATCH", body: JSON.stringify({ id, section: "Present" }) });
    await loadAll();
  }

  if (action === "deleteCompleted") {
    if (!confirm("Permanently delete this completed build? This can't be undone.")) return;
    await api("/api/projects", { method: "DELETE", body: JSON.stringify({ id }) });
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

  if (action === "toggleTask") {
    const task = state.tasks.find((t) => t.id === id);
    await api("/api/tasks", { method: "PATCH", body: JSON.stringify({ id, done: !task.done }) });
    await loadAll();
  }

  if (action === "deleteTask") {
    await api("/api/tasks", { method: "DELETE", body: JSON.stringify({ id }) });
    await loadAll();
  }
});

// ===== Top 3 Priorities picker =====
document.addEventListener("change", async (e) => {
  const sel = e.target.closest('[data-action="setPriority"]');
  if (!sel) return;
  const rank = Number(sel.dataset.rank);
  const chosenId = sel.value;
  sel.disabled = true;
  try {
    if (!chosenId) {
      const current = state.projects.find((p) => p.priorityRank === rank);
      if (current) await api("/api/projects", { method: "PATCH", body: JSON.stringify({ id: current.id, priorityRank: null }) });
    } else {
      await api("/api/projects", { method: "PATCH", body: JSON.stringify({ id: chosenId, priorityRank: rank }) });
    }
    await loadAll();
  } catch (err) {
    alert(err.message);
    sel.disabled = false;
  }
});

// ===== per-build task add =====
document.addEventListener("keydown", async (e) => {
  if (!e.target.classList?.contains("task-add-input") || e.key !== "Enter") return;
  const input = e.target;
  const task = input.value.trim();
  if (!task) return;
  input.disabled = true;
  try {
    await api("/api/tasks", { method: "POST", body: JSON.stringify({ businessId: input.dataset.businessId, task }) });
    await loadAll();
  } catch (err) {
    alert(err.message);
    input.disabled = false;
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

// ===== collapsible sidebar (defaults to collapsed) =====
const SIDEBAR_COLLAPSED_KEY = "vb-sidebar-collapsed";
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
}
const storedSidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
setSidebarCollapsed(storedSidebarCollapsed === null ? true : storedSidebarCollapsed === "1");
sidebarToggleBtn.addEventListener("click", () => setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed")));

// ===== collapsible Recent Activity =====
const ACTIVITY_COLLAPSED_KEY = "vb-activity-collapsed";
const activityToggleBtn = document.getElementById("activityToggleBtn");
const activityListEl = document.getElementById("activityList");
function setActivityCollapsed(collapsed) {
  activityListEl.style.display = collapsed ? "none" : "";
  activityToggleBtn.textContent = collapsed ? "Show" : "Hide";
  activityToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem(ACTIVITY_COLLAPSED_KEY, collapsed ? "1" : "0");
}
setActivityCollapsed(localStorage.getItem(ACTIVITY_COLLAPSED_KEY) === "1");
activityToggleBtn.addEventListener("click", () => setActivityCollapsed(activityListEl.style.display !== "none"));

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
