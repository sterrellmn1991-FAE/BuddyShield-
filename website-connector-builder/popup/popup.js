const listEl = document.getElementById("connector-list");
const statusEl = document.getElementById("status");

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showStatus(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = false;
  setTimeout(() => (statusEl.hidden = true), 2500);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getConnectors() {
  const data = await chrome.storage.local.get("connectors");
  return data.connectors || [];
}

async function saveConnectors(list) {
  await chrome.storage.local.set({ connectors: list });
}

function fieldCount(c) {
  const single = c.fields ? c.fields.length : 0;
  const list = c.list && c.list.itemFields ? c.list.itemFields.length : 0;
  return single + list;
}

function renderResultsHtml(connector, result) {
  let html = "";
  const fieldEntries = Object.entries(result.fields || {});
  if (fieldEntries.length) {
    html += fieldEntries.map(([k, v]) => `<div><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</div>`).join("");
  }
  if (result.list) {
    html += `<div style="margin-top:4px"><b>${result.list.count} rows</b></div>`;
    const cols = (connector.list.itemFields || []).map((f) => f.name);
    if (cols.length && result.list.rows.length) {
      html += `<table><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
      html += result.list.rows
        .slice(0, 5)
        .map((row) => `<tr>${cols.map((c) => `<td>${escapeHtml(row[c])}</td>`).join("")}</tr>`)
        .join("");
      html += `</table>`;
    }
  }
  return html || `<span style="color:#9ca3af">No matches on this page.</span>`;
}

function exportConnector(connector) {
  const blob = new Blob([JSON.stringify(connector, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(connector.name || "connector").replace(/[^a-z0-9-_]+/gi, "_")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function render() {
  const connectors = await getConnectors();
  if (!connectors.length) {
    listEl.innerHTML = `<div class="empty">No connectors saved yet.<br/>Click "Open Builder Here" on any page to create one.</div>`;
    return;
  }
  connectors.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  listEl.innerHTML = connectors
    .map(
      (c) => `
      <div class="connector" data-id="${c.id}">
        <div class="connector-head">
          <span class="connector-name">${escapeHtml(c.name)}</span>
          <span class="connector-domain">${escapeHtml(c.domain)}</span>
        </div>
        <div class="connector-meta">${fieldCount(c)} field(s)${c.list ? " + list" : ""}</div>
        <div class="connector-actions">
          <button class="btn run">Run</button>
          <button class="btn export">Export</button>
          <button class="btn btn-danger delete">Delete</button>
        </div>
        <div class="results" hidden></div>
      </div>`
    )
    .join("");
}

listEl.addEventListener("click", async (e) => {
  const row = e.target.closest(".connector");
  if (!row) return;
  const id = row.dataset.id;
  const connectors = await getConnectors();
  const connector = connectors.find((c) => c.id === id);
  if (!connector) return;

  if (e.target.classList.contains("delete")) {
    const updated = connectors.filter((c) => c.id !== id);
    await saveConnectors(updated);
    render();
    return;
  }

  if (e.target.classList.contains("export")) {
    exportConnector(connector);
    return;
  }

  if (e.target.classList.contains("run")) {
    const resultsEl = row.querySelector(".results");
    resultsEl.hidden = false;
    resultsEl.textContent = "Running…";
    try {
      const tab = await getActiveTab();
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["lib/extract.js"] });
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (c) => window.__cbExtract.runConnector(c),
        args: [connector],
      });
      resultsEl.innerHTML = renderResultsHtml(connector, result);
    } catch (err) {
      resultsEl.textContent = "Could not run on this tab (open the page first).";
    }
  }
});

document.getElementById("open-builder").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
    showStatus("Open a regular web page first.");
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/selector.js", "lib/extract.js", "content/builder.js"],
    });
    window.close();
  } catch (err) {
    showStatus("Could not inject builder on this page.");
  }
});

render();
