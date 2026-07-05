# Website Connector Builder

A Chrome (Manifest V3) extension for building reusable data connectors for any
website by **highlighting fields directly on the page** — no APIs, no scraping
code. Useful for sites that don't expose a public API or feed.

## Install (unpacked, for development)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `website-connector-builder/` folder.
4. Pin the extension so its icon is visible in the toolbar.

## Building a connector

1. Navigate to the target page, then click the extension icon and **Open
   Builder Here**. A panel appears in the top-right corner (drag it by the
   header if it's in the way).
2. **Single fields** — click **+ Field**, then click anything on the page
   (a title, a price, an image, a link). Each click captures another field;
   click **Stop picking** (or press `Esc`) when done. Hovering shows a live
   blue outline so you always know what you're about to capture.
3. **Repeating lists** — click **+ List**, then click one full repeating
   item (a product card, a search result, a table row — not a field inside
   it). The tool finds its siblings and reports how many items it matched,
   then automatically switches to picking sub-fields: click the title,
   price, image, etc. *inside* the highlighted item, and the same relative
   selector is reused for every item.
4. Rename fields, switch their extraction type (Text / HTML / Link / Image /
   custom attribute) and remove ones you don't need directly in the field
   rows — sample values from the page are shown so you can sanity check.
5. Click **Test** to re-run all selectors against the current page and
   preview the extracted values (including a table for list rows).
6. Name the connector and click **Save** — it's stored locally
   (`chrome.storage.local`), keyed to the page's domain. **Export JSON**
   downloads the raw connector definition.

## Running a saved connector

Open the extension popup: every saved connector is listed with its domain
and field count. Click **Run** to re-extract data from whatever page is
currently open in the active tab (the selectors must match that page), or
**Export** to grab the JSON, or **Delete** to remove it.

## Connector format

```json
{
  "id": "cb_...",
  "name": "Product listings",
  "domain": "example.com",
  "urlPattern": "https://example.com/products",
  "fields": [{ "id": "...", "name": "title", "selector": "#main h1", "attr": "text" }],
  "list": {
    "selector": "main > div.card",
    "itemFields": [
      { "id": "...", "name": "title", "selector": "h3:nth-of-type(1)", "attr": "text" },
      { "id": "...", "name": "price", "selector": "span:nth-of-type(2)", "attr": "text" }
    ]
  }
}
```

`attr` is one of `text`, `html`, `href`, `src`, or any custom attribute name.
List item selectors are structural (tag + position) and relative to each
matched item, so they generalize across every row sharing the same markup
template.

## Limitations

- **Selectors drift.** If a site redesigns its markup, saved selectors can
  stop matching — re-open the builder and re-pick the field.
- **Dynamic/JS-rendered content** must have actually loaded in the page
  before you pick or run a connector (the extension reads the live DOM, it
  doesn't wait for async content itself).
- **Respect each site's terms of service and `robots.txt`** before scraping
  it on a schedule or at volume.
- This extension only reads the DOM of the active tab — running connectors
  in the background/on a schedule (e.g. via a headless Playwright runner
  reading the exported JSON) is a natural next step, not included yet.
