// Shared extraction logic — runs in page context (content script or injected via chrome.scripting).
// Exposed as window.__cbExtract so both the builder UI and the popup's "Run" action share one implementation.
(function () {
  function readValue(el, attr) {
    if (!el) return null;
    switch (attr) {
      case "text":
        return el.textContent.trim();
      case "html":
        return el.innerHTML;
      case "href":
        return el.href || el.closest("a")?.href || null;
      case "src":
        return el.src || null;
      default:
        return el.getAttribute(attr);
    }
  }

  function extractField(root, field) {
    try {
      const el = root.querySelector(field.selector);
      return readValue(el, field.attr);
    } catch (e) {
      return null;
    }
  }

  // Runs a saved connector definition against the current document.
  // Returns { fields: {name: value}, list: { count, rows: [{name: value}] } }
  function runConnector(connector) {
    const result = { fields: {}, list: null };

    (connector.fields || []).forEach((f) => {
      result.fields[f.name] = extractField(document, f);
    });

    if (connector.list && connector.list.selector) {
      const items = Array.from(document.querySelectorAll(connector.list.selector));
      const rows = items.map((item) => {
        const row = {};
        (connector.list.itemFields || []).forEach((f) => {
          row[f.name] = extractField(item, f);
        });
        return row;
      });
      result.list = { count: items.length, rows };
    }

    return result;
  }

  window.__cbExtract = { extractField, runConnector, readValue };
})();
