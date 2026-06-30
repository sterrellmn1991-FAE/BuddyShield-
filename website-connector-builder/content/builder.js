// Injected on demand (popup "Open Builder Here" or the action icon). Builds a shadow-DOM
// panel for picking fields on the live page. Requires lib/selector.js + lib/extract.js
// to already be injected in the same call (see popup.js).
(function () {
  if (window.__cbInjected) {
    const existing = document.getElementById("cb-host-root");
    if (existing) existing.style.display = existing.style.display === "none" ? "" : "none";
    return;
  }
  window.__cbInjected = true;

  const { getAbsoluteSelector, getRelativeSelector, findListSelector } = window.__cbSelector;
  const { readValue, runConnector } = window.__cbExtract;

  const cbId = () => "cb_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const state = {
    mode: "idle", // idle | pick-field | pick-list-root | pick-list-field
    itemRootEl: null,
    connector: { id: null, name: "", domain: location.hostname, urlPattern: location.href, fields: [], list: null },
  };

  // ---------- shadow host & markup ----------
  const host = document.createElement("div");
  host.id = "cb-host-root";
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .cb-overlay { position: fixed; display: none; pointer-events: none; border-radius: 2px; }
      .cb-overlay-hover { border: 2px solid #2563eb; background: rgba(37, 99, 235, 0.12); z-index: 2147483646; }
      .cb-overlay-item { border: 2px dashed #f59e0b; background: rgba(245, 158, 11, 0.06); z-index: 2147483645; }
      .cb-panel {
        position: fixed; top: 16px; right: 16px; width: 320px; max-height: 86vh;
        background: #fff; color: #111827; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.25);
        display: flex; flex-direction: column; font-size: 13px; overflow: hidden;
      }
      .cb-header { display:flex; align-items:center; gap:8px; padding:10px 12px; background:#111827; color:#fff; cursor:move; user-select:none; }
      .cb-drag { opacity:.6; }
      .cb-title { font-weight:600; flex:1; }
      .cb-btn-icon { background:none; border:none; color:#fff; cursor:pointer; font-size:14px; padding:2px 6px; }
      .cb-body { padding:10px 12px; overflow-y:auto; flex:1; }
      .cb-label { display:block; font-weight:600; margin-bottom:4px; color:#374151; }
      .cb-input { width:100%; padding:6px 8px; border:1px solid #d1d5db; border-radius:6px; margin-bottom:10px; font-size:13px; }
      .cb-row { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px; }
      .cb-btn { flex:1; padding:7px 8px; border:1px solid #d1d5db; background:#f9fafb; border-radius:6px; cursor:pointer; font-size:12.5px; white-space:nowrap; }
      .cb-btn:hover { background:#f3f4f6; }
      .cb-btn-primary { background:#2563eb; border-color:#2563eb; color:#fff; }
      .cb-btn-primary:hover { background:#1d4ed8; }
      .cb-btn-danger { background:#fff; border-color:#fca5a5; color:#b91c1c; }
      .cb-btn-stop { background:#b91c1c; border-color:#b91c1c; color:#fff; flex:1 0 100%; }
      .cb-hint { min-height:16px; color:#6b7280; font-size:12px; margin-bottom:8px; }
      .cb-hint.cb-flash { color:#2563eb; font-weight:600; }
      .cb-section { margin-top:10px; border-top:1px solid #e5e7eb; padding-top:8px; }
      .cb-section-title { font-weight:600; margin-bottom:6px; color:#374151; }
      .cb-muted { color:#9ca3af; font-weight:400; }
      .cb-fields-list { display:flex; flex-direction:column; gap:6px; }
      .cb-field-row { display:flex; align-items:center; gap:4px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; padding:4px 6px; }
      .cb-field-name { width:64px; flex:0 0 auto; border:1px solid #d1d5db; border-radius:4px; padding:3px 4px; font-size:12px; }
      .cb-field-attr { border:1px solid #d1d5db; border-radius:4px; font-size:11px; padding:2px; flex:0 0 auto; }
      .cb-field-customattr { width:56px; border:1px solid #d1d5db; border-radius:4px; font-size:11px; padding:2px 4px; }
      .cb-field-sample { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#6b7280; font-size:11px; min-width:0; }
      .cb-field-del { border:none; background:none; color:#9ca3af; cursor:pointer; font-size:13px; padding:0 2px; }
      .cb-field-del:hover { color:#b91c1c; }
      .cb-results { font-size:11.5px; max-height:160px; overflow:auto; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; padding:6px; }
      .cb-results table { width:100%; border-collapse:collapse; }
      .cb-results th, .cb-results td { text-align:left; padding:2px 4px; border-bottom:1px solid #e5e7eb; white-space:nowrap; max-width:120px; overflow:hidden; text-overflow:ellipsis; }
      .cb-footer { padding:10px 12px; border-top:1px solid #e5e7eb; background:#fafafa; }
      .cb-select { width:100%; padding:6px; border:1px solid #d1d5db; border-radius:6px; margin-bottom:8px; font-size:12.5px; }
    </style>
    <div class="cb-overlay cb-overlay-hover" id="cb-hover-overlay"></div>
    <div class="cb-overlay cb-overlay-item" id="cb-item-overlay"></div>
    <div class="cb-panel" id="cb-panel">
      <div class="cb-header" id="cb-header">
        <span class="cb-drag">&#10021;</span>
        <span class="cb-title">Connector Builder</span>
        <button class="cb-btn-icon" id="cb-close" title="Close">&times;</button>
      </div>
      <div class="cb-body">
        <label class="cb-label" for="cb-name">Connector name</label>
        <input id="cb-name" class="cb-input" placeholder="e.g. Product listings" />

        <div class="cb-row">
          <button id="cb-pick-field" class="cb-btn">+ Field</button>
          <button id="cb-pick-list" class="cb-btn">+ List</button>
        </div>
        <button id="cb-stop" class="cb-btn cb-btn-stop" hidden>Stop picking (Esc)</button>
        <div class="cb-hint" id="cb-hint">Click "+ Field" then click anything on the page to capture it.</div>

        <div class="cb-section" id="cb-fields-section">
          <div class="cb-section-title">Fields</div>
          <div id="cb-fields-list" class="cb-fields-list"></div>
        </div>

        <div class="cb-section" id="cb-list-section" hidden>
          <div class="cb-section-title">List <span id="cb-list-count" class="cb-muted"></span></div>
          <div id="cb-list-fields" class="cb-fields-list"></div>
        </div>

        <div class="cb-section" id="cb-results-section" hidden>
          <div class="cb-section-title">Test results</div>
          <div id="cb-results" class="cb-results"></div>
        </div>
      </div>
      <div class="cb-footer">
        <select id="cb-load-select" class="cb-select"><option value="">Load saved…</option></select>
        <div class="cb-row">
          <button id="cb-test" class="cb-btn">Test</button>
          <button id="cb-save" class="cb-btn cb-btn-primary">Save</button>
        </div>
        <div class="cb-row">
          <button id="cb-export" class="cb-btn">Export JSON</button>
          <button id="cb-clear" class="cb-btn cb-btn-danger">Clear</button>
        </div>
      </div>
    </div>
  `;

  const $ = (sel) => shadow.querySelector(sel);
  const panel = $("#cb-panel");
  const hoverOverlay = $("#cb-hover-overlay");
  const itemOverlay = $("#cb-item-overlay");
  const hintEl = $("#cb-hint");
  const nameInput = $("#cb-name");
  const stopBtn = $("#cb-stop");
  const loadSelect = $("#cb-load-select");

  // ---------- overlay helpers ----------
  function positionOverlay(el, targetEl) {
    if (!targetEl || !targetEl.getBoundingClientRect) {
      el.style.display = "none";
      return;
    }
    const r = targetEl.getBoundingClientRect();
    el.style.display = "block";
    el.style.left = r.left + "px";
    el.style.top = r.top + "px";
    el.style.width = r.width + "px";
    el.style.height = r.height + "px";
  }
  function hideOverlay(el) {
    el.style.display = "none";
  }
  function flashElement(el) {
    if (!el) return;
    const prev = el.style.outline;
    const prevOffset = el.style.outlineOffset;
    el.style.outline = "3px solid #22c55e";
    el.style.outlineOffset = "1px";
    setTimeout(() => {
      el.style.outline = prev;
      el.style.outlineOffset = prevOffset;
    }, 600);
  }
  function flashHint(msg) {
    hintEl.textContent = msg;
    hintEl.classList.add("cb-flash");
    setTimeout(() => hintEl.classList.remove("cb-flash"), 1200);
  }

  // ---------- mode/UI ----------
  function setMode(mode) {
    state.mode = mode;
    stopBtn.hidden = mode === "idle";
    if (mode === "idle") {
      hideOverlay(hoverOverlay);
      hideOverlay(itemOverlay);
      state.itemRootEl = null;
      hintEl.textContent = "Click “+ Field” or “+ List” to start picking.";
    } else if (mode === "pick-field") {
      hintEl.textContent = "Click anything on the page to capture it. Keeps picking until you stop.";
    } else if (mode === "pick-list-root") {
      hintEl.textContent = "Click one repeating item (a card, row, or list entry) — not a field inside it.";
    } else if (mode === "pick-list-field") {
      hintEl.textContent = "Now click fields inside the highlighted item.";
    }
  }

  function guessAttr(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "img") return "src";
    if (tag === "a") return "href";
    return "text";
  }
  function guessName(el, existingCount) {
    const tag = el.tagName.toLowerCase();
    let base = "text";
    if (tag === "img") base = "image";
    else if (tag === "a") base = "link";
    else if (/^h[1-6]$/.test(tag)) base = "heading";
    else if (tag === "button") base = "button";
    return `${base}${existingCount + 1}`;
  }

  // ---------- picking ----------
  let rafPending = false;
  function onMouseMove(e) {
    if (state.mode === "idle" || rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const path = e.composedPath();
      if (path.includes(host)) {
        hideOverlay(hoverOverlay);
        return;
      }
      const target = path[0];
      if (target instanceof Element) positionOverlay(hoverOverlay, target);
    });
  }

  function onClick(e) {
    if (state.mode === "idle") return;
    const path = e.composedPath();
    if (path.includes(host)) return; // let panel UI work normally
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const target = path[0];
    if (!(target instanceof Element)) return;

    if (state.mode === "pick-field") {
      addSingleField(target);
    } else if (state.mode === "pick-list-root") {
      startListMode(target);
    } else if (state.mode === "pick-list-field") {
      if (target === state.itemRootEl || state.itemRootEl.contains(target)) {
        addListField(target);
      } else {
        flashHint("Click inside the highlighted item.");
      }
    }
  }

  function onScroll() {
    if (state.mode === "pick-list-field" && state.itemRootEl) {
      positionOverlay(itemOverlay, state.itemRootEl);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && state.mode !== "idle") setMode("idle");
  }

  window.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("keydown", onKeyDown, true);

  function addSingleField(el) {
    const selector = getAbsoluteSelector(el);
    if (!selector) {
      flashHint("Could not generate a selector for that element.");
      return;
    }
    const attr = guessAttr(el);
    const sample = readValue(el, attr);
    state.connector.fields.push({ id: cbId(), name: guessName(el, state.connector.fields.length), selector, attr, sample });
    renderFields();
    flashElement(el);
  }

  // Users often click a field inside a card rather than the card itself (e.g. the title
  // text). Walk up until we find a level that actually has repeating siblings, so a click
  // anywhere inside an item still resolves to the right item boundary.
  function findItemRoot(el) {
    let node = el;
    while (node && node !== document.body && node.parentElement) {
      const parent = node.parentElement;
      const siblingsSameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      if (siblingsSameTag.length >= 2) return node;
      node = parent;
    }
    return el;
  }

  function startListMode(clickedEl) {
    const el = findItemRoot(clickedEl);
    const found = findListSelector(el);
    if (!found || found.items.length === 0) {
      flashHint("Could not detect a repeating list here. Try clicking a card/row element.");
      return;
    }
    state.itemRootEl = el;
    state.connector.list = { selector: found.listSelector, itemFields: [] };
    setMode("pick-list-field");
    positionOverlay(itemOverlay, el);
    renderListSection();
    flashHint(`Found ${found.items.length} matching items.`);
  }

  function addListField(target) {
    const selector = getRelativeSelector(state.itemRootEl, target);
    if (!selector) {
      flashHint("Could not generate a selector for that element.");
      return;
    }
    const attr = guessAttr(target);
    const sample = readValue(target, attr);
    state.connector.list.itemFields.push({ id: cbId(), name: guessName(target, state.connector.list.itemFields.length), selector, attr, sample });
    renderListSection();
    flashElement(target);
  }

  // ---------- rendering field rows ----------
  const ATTR_OPTIONS = [
    ["text", "Text"],
    ["html", "HTML"],
    ["href", "Link (href)"],
    ["src", "Image (src)"],
    ["custom", "Attribute…"],
  ];

  function fieldRowHtml(f) {
    const isStandard = ["text", "html", "href", "src"].includes(f.attr);
    const optionsHtml = ATTR_OPTIONS.map(
      ([val, label]) => `<option value="${val}" ${(isStandard ? f.attr : "custom") === val ? "selected" : ""}>${label}</option>`
    ).join("");
    return `
      <div class="cb-field-row" data-id="${f.id}">
        <input class="cb-field-name" value="${escapeHtml(f.name)}" />
        <select class="cb-field-attr">${optionsHtml}</select>
        <input class="cb-field-customattr" placeholder="attr" value="${isStandard ? "" : escapeHtml(f.attr)}" ${isStandard ? "hidden" : ""} />
        <span class="cb-field-sample" title="${escapeHtml(f.selector)}">${escapeHtml(f.sample)}</span>
        <button class="cb-field-del" title="Remove">&times;</button>
      </div>`;
  }

  function bindFieldList(containerEl, getArray, onStructuralChange) {
    containerEl.addEventListener("input", (e) => {
      const row = e.target.closest(".cb-field-row");
      if (!row) return;
      const f = getArray().find((x) => x.id === row.dataset.id);
      if (!f) return;
      if (e.target.classList.contains("cb-field-name")) f.name = e.target.value;
      if (e.target.classList.contains("cb-field-customattr")) f.attr = e.target.value || "text";
    });
    containerEl.addEventListener("change", (e) => {
      const row = e.target.closest(".cb-field-row");
      if (!row) return;
      const f = getArray().find((x) => x.id === row.dataset.id);
      if (!f) return;
      if (e.target.classList.contains("cb-field-attr")) {
        const val = e.target.value;
        const customInput = row.querySelector(".cb-field-customattr");
        if (val === "custom") {
          customInput.hidden = false;
          f.attr = customInput.value || "";
        } else {
          customInput.hidden = true;
          f.attr = val;
        }
      }
    });
    containerEl.addEventListener("click", (e) => {
      if (!e.target.classList.contains("cb-field-del")) return;
      const row = e.target.closest(".cb-field-row");
      const arr = getArray();
      const idx = arr.findIndex((x) => x.id === row.dataset.id);
      if (idx > -1) arr.splice(idx, 1);
      onStructuralChange();
    });
  }

  const fieldsListEl = $("#cb-fields-list");
  const listFieldsEl = $("#cb-list-fields");
  const listSectionEl = $("#cb-list-section");
  const listCountEl = $("#cb-list-count");

  function renderFields() {
    fieldsListEl.innerHTML = state.connector.fields.map(fieldRowHtml).join("") || `<div class="cb-muted">No fields yet.</div>`;
  }
  function renderListSection() {
    if (!state.connector.list) {
      listSectionEl.hidden = true;
      return;
    }
    listSectionEl.hidden = false;
    let count = 0;
    try {
      count = document.querySelectorAll(state.connector.list.selector).length;
    } catch (e) {}
    listCountEl.textContent = `(${count} items)`;
    listFieldsEl.innerHTML =
      state.connector.list.itemFields.map(fieldRowHtml).join("") || `<div class="cb-muted">Click "+ List" then click fields inside the item.</div>`;
  }

  bindFieldList(fieldsListEl, () => state.connector.fields, renderFields);
  bindFieldList(listFieldsEl, () => state.connector.list.itemFields, renderListSection);

  // ---------- footer actions ----------
  $("#cb-pick-field").addEventListener("click", () => setMode("pick-field"));
  $("#cb-pick-list").addEventListener("click", () => setMode("pick-list-root"));
  stopBtn.addEventListener("click", () => setMode("idle"));
  $("#cb-close").addEventListener("click", () => {
    setMode("idle");
    host.style.display = "none";
  });

  const resultsSection = $("#cb-results-section");
  const resultsEl = $("#cb-results");

  $("#cb-test").addEventListener("click", () => {
    const result = runConnector(state.connector);
    resultsSection.hidden = false;

    let html = "";
    const fieldEntries = Object.entries(result.fields);
    if (fieldEntries.length) {
      html += fieldEntries.map(([k, v]) => `<div><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</div>`).join("");
    }
    if (result.list) {
      html += `<div style="margin-top:6px"><b>${result.list.count} rows found</b></div>`;
      const cols = (state.connector.list.itemFields || []).map((f) => f.name);
      if (cols.length && result.list.rows.length) {
        html += `<table><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
        html += result.list.rows
          .slice(0, 5)
          .map((row) => `<tr>${cols.map((c) => `<td>${escapeHtml(row[c])}</td>`).join("")}</tr>`)
          .join("");
        html += `</table>`;
      }
    }
    resultsEl.innerHTML = html || `<span class="cb-muted">No matches.</span>`;

    state.connector.fields.forEach((f) => {
      try {
        const el = document.querySelector(f.selector);
        if (el) flashElement(el);
      } catch (e) {}
    });
    if (state.connector.list) {
      try {
        document.querySelectorAll(state.connector.list.selector).forEach(flashElement);
      } catch (e) {}
    }
  });

  async function populateLoadSelect() {
    const data = await chrome.storage.local.get("connectors");
    const list = (data.connectors || []).filter((c) => c.domain === location.hostname);
    loadSelect.innerHTML =
      `<option value="">Load saved…</option>` + list.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  }

  loadSelect.addEventListener("change", async () => {
    const id = loadSelect.value;
    if (!id) return;
    const data = await chrome.storage.local.get("connectors");
    const found = (data.connectors || []).find((c) => c.id === id);
    if (found) {
      state.connector = JSON.parse(JSON.stringify(found));
      nameInput.value = state.connector.name;
      renderFields();
      renderListSection();
      resultsSection.hidden = true;
    }
  });

  $("#cb-save").addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      flashHint("Give the connector a name first.");
      nameInput.focus();
      return;
    }
    const hasFields = state.connector.fields.length || (state.connector.list && state.connector.list.itemFields.length);
    if (!hasFields) {
      flashHint("Capture at least one field before saving.");
      return;
    }
    state.connector.name = name;
    state.connector.domain = location.hostname;
    state.connector.urlPattern = location.href;
    state.connector.savedAt = Date.now();
    if (!state.connector.id) state.connector.id = cbId();

    const data = await chrome.storage.local.get("connectors");
    const list = data.connectors || [];
    const idx = list.findIndex((c) => c.id === state.connector.id);
    if (idx > -1) list[idx] = state.connector;
    else list.push(state.connector);
    await chrome.storage.local.set({ connectors: list });
    await populateLoadSelect();
    flashHint("Saved ✓");
  });

  $("#cb-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.connector, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(state.connector.name || "connector").replace(/[^a-z0-9-_]+/gi, "_")}.json`;
    shadow.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $("#cb-clear").addEventListener("click", () => {
    setMode("idle");
    state.connector = { id: null, name: "", domain: location.hostname, urlPattern: location.href, fields: [], list: null };
    nameInput.value = "";
    resultsSection.hidden = true;
    renderFields();
    renderListSection();
  });

  // ---------- drag ----------
  const header = $("#cb-header");
  header.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    const rect = panel.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    panel.style.right = "auto";
    function onMove(ev) {
      panel.style.left = Math.max(0, ev.clientX - offsetX) + "px";
      panel.style.top = Math.max(0, ev.clientY - offsetY) + "px";
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // ---------- init ----------
  setMode("idle");
  renderFields();
  populateLoadSelect();
})();
