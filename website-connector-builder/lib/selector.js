// Selector-generation engine — runs in page context. Exposed as window.__cbSelector.
(function () {
  function isUnique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  function nthOfTypeIndex(el) {
    let i = 1;
    let sib = el.previousElementSibling;
    while (sib) {
      if (sib.tagName === el.tagName) i++;
      sib = sib.previousElementSibling;
    }
    return i;
  }

  function uniqueAttrSelector(el) {
    const candidates = ["data-testid", "data-test", "data-qa", "name", "aria-label"];
    for (const attr of candidates) {
      const val = el.getAttribute(attr);
      if (val) {
        const sel = `${el.tagName.toLowerCase()}[${attr}="${val.replace(/(["\\])/g, "\\$1")}"]`;
        if (isUnique(sel)) return sel;
      }
    }
    return null;
  }

  // Absolute, document-wide unique selector. Used for standalone (non-list) fields.
  function getAbsoluteSelector(el) {
    if (!(el instanceof Element)) return null;

    if (el.id) {
      const sel = `#${CSS.escape(el.id)}`;
      if (isUnique(sel)) return sel;
    }

    const attrSel = uniqueAttrSelector(el);
    if (attrSel) return attrSel;

    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part;
      if (node.id) {
        part = `#${CSS.escape(node.id)}`;
        parts.unshift(part);
        return parts.join(" > ");
      }
      part = `${node.tagName.toLowerCase()}:nth-of-type(${nthOfTypeIndex(node)})`;
      parts.unshift(part);

      const candidate = parts.join(" > ");
      if (isUnique(candidate)) return candidate;

      node = node.parentElement;
    }
    return parts.join(" > ") || el.tagName.toLowerCase();
  }

  // Structural selector relative to `root` (e.g. a list item), using only tag + nth-of-type
  // so the same selector generalizes across every item sharing the same template.
  function getRelativeSelector(root, el) {
    if (el === root) return ":scope";
    const parts = [];
    let node = el;
    while (node && node !== root && node.parentElement) {
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${nthOfTypeIndex(node)})`);
      node = node.parentElement;
    }
    if (node !== root) return null;
    return parts.join(" > ");
  }

  // Given a clicked element believed to be one item of a repeating list, find its siblings
  // and build a selector that matches the whole list.
  function findListSelector(el) {
    const parent = el.parentElement;
    if (!parent) return null;

    const tag = el.tagName.toLowerCase();
    const siblingsSameTag = Array.from(parent.children).filter(
      (c) => c.tagName === el.tagName
    );

    const parentSelector = getAbsoluteSelector(parent);
    if (!parentSelector) return null;

    let bestSelector = `${parentSelector} > ${tag}`;
    if (el.classList.length) {
      const classSel = "." + Array.from(el.classList).map((c) => CSS.escape(c)).join(".");
      const candidate = `${parentSelector} > ${tag}${classSel}`;
      try {
        if (document.querySelectorAll(candidate).length >= siblingsSameTag.length) {
          bestSelector = candidate;
        }
      } catch (e) {
        /* keep bestSelector as-is */
      }
    }

    const items = Array.from(document.querySelectorAll(bestSelector));
    return { listSelector: bestSelector, items };
  }

  window.__cbSelector = { getAbsoluteSelector, getRelativeSelector, findListSelector };
})();
