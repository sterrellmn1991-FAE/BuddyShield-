# Project Status — Website Connector Builder

**Log line:** A point-and-click browser extension that turns any website into a
reusable data connector — no API, no code: you highlight the fields you want,
and it remembers how to grab them.

---

## What it is

A standalone Chrome extension (Manifest V3), separate from the BuddyShield app,
that solves a common problem: many sites have data you want but no official API
or feed. Instead of hand-writing a scraper, you click the extension, hover over
the page, and click the fields you care about — a title, a price, an image. It
generates the selectors behind the scenes and saves them as a reusable
"connector" you can re-run any time.

## Progress: ~halfway

### Working and verified today
- Hover-to-highlight + click-to-capture for single fields.
- "List" mode that detects repeating items (product cards, search results,
  table rows) and generalizes one pick across all of them — including
  auto-promotion to the right item boundary when a sub-element is clicked
  instead of the container.
- Live test-run that previews the extracted data (fields + a table for lists).
- Save/load connectors per website (`chrome.storage.local`) and JSON export.
- Popup that lists saved connectors and re-runs extraction against the active tab.

All of the above has been run end-to-end in real Chromium (via Playwright)
against a test page and pulls correct data.

### Still ahead (the second half)
- A headless runner so saved connectors can execute on a schedule outside the
  browser (true automation, not just manual re-runs).
- Resilience when sites change their markup: selector-drift detection and alerts.
- Polish on trickier pages: JS-rendered content, login-gated areas, pagination.

## Where feedback / support would help most
- Whether the highlight-to-capture flow feels fast and obvious to a first-time user.
- Which target sites people actually want connectors for — that tells us what to
  harden first.
