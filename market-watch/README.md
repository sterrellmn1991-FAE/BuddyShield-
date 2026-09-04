# Market Watch

A browser app that watches stocks and crypto, alerts you when a price target or
a move is hit, and tells you — with its reasoning shown — whether each market is
bullish, bearish, correcting, recovering, or going nowhere.

No build step, no framework, no dependencies. Open it and it runs.

**Live:** https://sterrellmn1991-fae.github.io/BuddyShield-/
*(published from `main` by GitHub Actions — see [Deployment](#deployment))*

On the hosted copy, **demo mode and live crypto both work with no setup**. Live
*stocks* need either a free Alpha Vantage key in Settings or a local run
(`npm start`), because a static host has no proxy to get past Yahoo's missing
CORS headers.

---

## Quick start

Two ways to run it, depending on whether you want live stock data.

**Option A — open the file directly**

```bash
# from the repo root
open market-watch/index.html          # macOS
xdg-open market-watch/index.html      # Linux
```

Works immediately in **Demo mode** (simulated but realistic prices). Live crypto
also works from `file://`. Live *stocks* generally will not — see
[Why stocks are harder](#why-stocks-are-harder).

**Option B — run the bundled server (recommended for live stocks)**

```bash
cd market-watch
npm start                 # no install needed, zero dependencies
```

Then open <http://localhost:8787>. The server proxies stock requests, which is
what makes live stock data work without any API key.

Turn off **Demo mode** in Settings when you want real prices.

**Option C — the background watcher (alerts with the browser closed)**

```bash
cd market-watch
cp watcher.config.example.json watcher.config.json
npm run watch
```

See [Background watcher](#background-watcher--alerts-while-the-browser-is-closed).

---

## What it does

### Price and movement alerts

| Alert type | Fires when |
|---|---|
| Price rises above | Price crosses a target going up |
| Price falls below | Price crosses a target going down |
| Percent move | An asset gains/drops/moves more than X% in a session |
| RSI level | RSI crosses into overbought or oversold territory |
| MACD crossover | Momentum turns up or down (a cross printed *today*) |
| Unusual move | A move larger than X standard deviations of that asset's own normal range |
| Regime change | An asset flips from one market state to another |

Two behaviours make these usable rather than maddening:

- **Edge triggering.** An alert fires on the *transition* into its condition,
  not on every poll. "BTC above $70,000" fires once when it crosses — not every
  60 seconds for the rest of the week.
- **Cooldown.** Even a genuine re-cross is suppressed if it happens within the
  cooldown window, so price oscillating around your threshold doesn't spam you.

Alerts reach you as an on-screen toast, a desktop notification, a sound, and —
if you switch it on — **read aloud** via your browser's speech synthesis.

### Telling bullish apart from everything else

This is the part that isn't just a price ticker. Every asset is classified into
one of five states, and the app always shows *why*:

| State | Meaning |
|---|---|
| **Bullish** | Well off the lows, above the long-term average, short-term average above long-term. A sustained uptrend. |
| **Bearish** | Down past the bear threshold from its high, sitting below its long-term average. Rallies inside this state often fail. |
| **Correction** | A meaningful pullback, not deep enough to be a bear market. Genuinely ambiguous — resolves both ways. |
| **Recovery** | Bounced hard off the lows but hasn't reclaimed the long-term average. Common at real bottoms *and* in bear-market rallies, so treated as unconfirmed. |
| **Sideways** | No decisive trend. Trend-following signals are least reliable here. |

The verdict is never a single number. Five independent pieces of evidence are
gathered — drawdown from the high, run-up from the low, price versus the
long-term average, the 50/long-term average relationship (golden and death
crosses), and the slope of the 50-day — and the app reports both the call and
the tally behind it:

> **Why this is called Bearish**
> - Down 75.1% from its 252-bar high (bear threshold is 35%).
> - Trading below its 200-day average.
> - 50-day average is below the long-term average (bearish stack).
> - The 50-day average is rising (0.380%/bar).
>
> *75% of the trend signals agree with this call (1 bullish, 3 bearish).*

Note that the dissenting signal is shown too. A verdict you can't audit is a
verdict you shouldn't trust.

#### Crypto gets different thresholds

The conventional equity definitions (+20% off the lows is a bull market, −20%
off the highs is a bear market, −10% is a correction) are meaningless applied to
crypto, where a 20% drawdown is an ordinary week. So thresholds are per asset
class:

| | Correction | Bear | Bull |
|---|---|---|---|
| Stocks | −10% | −20% | +20% |
| Crypto | −20% | −35% | +40% |

The same price series can therefore read *Bearish* as a stock and merely
*Correcting* as a crypto asset. That's deliberate, and there's a test for it.

### Momentum and volatility

- **RSI (14)**, Wilder-smoothed — overbought above 70, oversold below 30.
- **MACD (12/26/9)** — histogram plus crossover detection.
- **ATR (14)** compared against the asset's *own* median range, so "volatile"
  means volatile for that asset, not against some absolute number.
- **Return z-score** — how unusual today's move is versus the last 30 sessions.

---

## Background watcher — alerts while the browser is closed

The browser can only alert you while the tab is open. A service worker doesn't
change that: it still needs the browser process running. So the watcher is a
separate Node process that polls and alerts with no browser involved.

```bash
cd market-watch
cp watcher.config.example.json watcher.config.json   # then edit it
npm run watch
```

Or build your watchlist and alerts in the web UI and hit
**Settings → Export for watcher** — the exported file is exactly the config
format, ready to run.

```
Market Watch — background watcher
  watching 4 asset(s), 5 active rule(s)
  data:    live
  poll:    every 300s
  alerts:  desktop, webhook:discord, log:watcher-events.log
  quiet:   23:00–07:00 (critical alerts still get through)

  • BTC rises above $150,000.00
  • BTC falls below $90,000.00
  • ETH moves 8% in a session
  ...

[09:14:02] ! BTC rose above $150,000.00 — now $151,208.44.
         note: take some profit
  09:14:02  BTC ▲2.1% bullish  ·  ETH ▲0.4% bullish  ·  SPY ▼0.2% sideways
```

### Options

```
node watcher.js                       # uses ./watcher.config.json
node watcher.js --config path.json
node watcher.js --once                # one pass then exit — for cron
node watcher.js --dry-run             # evaluate and print, deliver nothing
node watcher.js --test-alert          # prove your channels work, right now
```

Run `--test-alert` first. It pushes a test through every configured channel and
tells you which ones actually worked, so you find out now rather than the
morning you needed the alert.

### How alerts reach you

| Channel | Reaches you when |
|---|---|
| **Webhook** (Discord/Slack/any JSON endpoint) | Anywhere, including your phone. This is the one that matters. |
| Desktop notification | You're at the machine |
| Speech | You're within earshot |
| Command | Hands the event as JSON on stdin to any program you name |
| Log file + console | Always |

To get alerts on your phone: make a Discord server for yourself, create a
channel webhook (Channel → Edit → Integrations → Webhooks), and put the URL in
the config. Discord's mobile app then pushes it to you.

```json
"webhooks": [
  { "url": "https://discord.com/api/webhooks/...", "format": "discord" }
]
```

Webhook URLs must be `https`, with one exception: plain `http` is allowed for
`localhost`, so you can relay to something on your own machine.

### Quiet hours

```json
"quietHours": { "start": "23:00", "end": "07:00" }
```

Mutes the attention-grabbing channels overnight — but never the durable ones.
The alert is still logged and still posted to your webhook; it just doesn't
make a noise at 3am. **Critical alerts ignore quiet hours entirely.** Windows
that wrap past midnight work correctly, and there's a test for it.

### It remembers across restarts

Rule state is persisted to `.watcher-state.json` after every pass, written
atomically. Restarting the watcher does **not** re-fire every alert whose
condition happens to be true at that moment — which is what would otherwise
happen, and would be enough to make you turn the thing off. Your fired-alert
history survives too.

### Keeping it running

The watcher runs while the *machine* is on. On a laptop that closes at night,
alerts stop when the lid does. For genuinely always-on alerting, run it on
something that stays up — a Raspberry Pi, an old laptop, or a small VPS.

**systemd (Linux):** `/etc/systemd/system/market-watch.service`

```ini
[Unit]
Description=Market Watch background watcher
After=network-online.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/market-watch
ExecStart=/usr/bin/node watcher.js
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now market-watch
journalctl -u market-watch -f
```

**launchd (macOS):** a `~/Library/LaunchAgents/*.plist` with `RunAtLoad` and
`KeepAlive` set, pointing `ProgramArguments` at `node watcher.js`.

**cron:** use `--once` and let cron own the schedule:

```
*/5 * * * * cd /path/to/market-watch && /usr/bin/node watcher.js --once >> cron.log 2>&1
```

Persisted state is what makes the cron approach work — each run picks up where
the last one left off instead of re-firing everything.

### Stocks are easier here

Node has no CORS. The watcher fetches Yahoo directly, so **live stock data works
with no API key and no proxy** — the thing the browser app needs `server.js`
for. Crypto is unchanged: CoinGecko, no key.

### Config reference

| Key | Meaning |
|---|---|
| `settings.demoMode` | Simulated prices. Set `false` for a real watcher. |
| `settings.refreshSeconds` | Poll interval; floored at 30s, defaults to 300s. Free APIs rate-limit — be kind. |
| `settings.*Key` | Optional API keys. **Not** included in an export from the web app. |
| `watchlist[]` | `{ symbol, assetType }` where assetType is `stock` or `crypto`. |
| `rules[]` | Same rule shape the web app uses. |
| `watcher.desktopNotifications` | OS notification on the local machine. |
| `watcher.speak` | Read alerts aloud locally. |
| `watcher.webhooks[]` | `{ url, format }` — format is `discord`, `slack`, or `json`. |
| `watcher.command` | A program (string or argv array) handed the event as JSON on stdin. |
| `watcher.logFile` | Append-only human-readable alert log. |
| `watcher.stateFile` | Where edge-trigger state persists. |
| `watcher.quietHours` | `{ start, end }` as `"HH:MM"`, or `null`. |

Config problems are caught at startup with a message that says what to fix —
including the easy-to-miss one where a rule names a symbol that isn't on the
watchlist, so it could never fire.

### A note on API keys

Keys are **not** included when the web app exports a config. An exported file
is the kind of thing that ends up pasted into a chat or committed to a repo,
and a key that leaks that way costs more than the ten seconds it takes to add
it to the config by hand. `watcher.config.json` and `.watcher-state.json` are
gitignored for the same reason.

---

## Data sources

**Crypto — CoinGecko.** No key required. Works straight from the browser.
A free demo key can be added in Settings to raise the rate limit.

**Stocks —** tried in this order, first success wins:

1. **Local proxy** (`npm start`) — free, full history, no key. Best option.
2. **Alpha Vantage** — free key, full daily history, browser-friendly.
3. **Finnhub** — free key, live quotes. Daily candles are premium on newer free
   plans, so this may degrade to quote-only (price alerts work, trend analysis
   doesn't).
4. **Yahoo direct** — tried last; usually blocked by CORS.

If every route fails, the error names each attempt and what to do about it,
rather than showing a generic "fetch failed".

### Why stocks are harder

Yahoo Finance doesn't send CORS headers, so a browser refuses the response even
though the data is public. This isn't something the page can fix from the client
side — the browser blocks it by design. The bundled server fetches Yahoo
server-side, where CORS doesn't apply, and hands the result to the page from its
own origin. That's the entire reason `server.js` exists.

### API keys

Stored in `localStorage` in your browser, and sent only to the API they belong
to. That's browser-local storage, not a vault — don't use it for a key that
controls anything but read-only market data.

---

## Demo mode

On by default. Generates deterministic synthetic price history — the same symbol
always produces the same chart — using a geometric random walk with a drift
regime baked in, so the classifier has real structure to find. It exists so that:

1. The app works with no network and no keys.
2. The whole pipeline is testable without a live market.
3. A rate limit or an API outage is a degradation, not a dead app.

---

## Deployment

The web app is static — HTML, CSS and ES modules, no build step — so it hosts
anywhere that serves files. `.github/workflows/deploy-pages.yml` publishes it to
GitHub Pages on every push to `main` that touches `market-watch/`.

**One-time setup** (repo Settings → Pages → Build and deployment → Source →
**GitHub Actions**). Nothing else to configure.

The workflow runs the test suite first and deploys only if it passes, so a red
suite never reaches the live site. It publishes `index.html`, `css/` and the
browser modules; `server.js`, `watcher.js`, `js/watcher/` and the tests are
excluded, since a static host cannot run them and shipping them would imply a
backend that isn't there.

### What works on a static host

| | Hosted on Pages | Run locally with `npm start` |
|---|---|---|
| Demo mode | ✅ | ✅ |
| Live crypto | ✅ no key needed | ✅ |
| Live stocks | needs a free Alpha Vantage key | ✅ no key needed |
| Background watcher | ✗ — it's a Node process | ✅ |

The app detects this itself: it probes the proxy path once, and a 404 latches
it off for the session rather than burning a doomed request per symbol on every
poll. A transient 5xx does not latch, since that might just be a restarting
server. Both behaviours are tested.

You can also deploy the same folder to Netlify, Vercel, Cloudflare Pages or any
static host — publish directory `market-watch`, no build command.

---

## Tests

```bash
cd market-watch
npm test
```

84 tests covering the parts where a quiet bug costs money:

- **Indicators** — verified against hand-computed values (Wilder RSI-14 on the
  canonical worked example, EMA seeding, ATR, sample standard deviation),
  plus alignment, warm-up and empty-input behaviour.
- **Regime classification** — steady trends, the correction/bear boundary, flat
  markets, the same drawdown reading differently for stocks and crypto, and the
  bear-market-rally trap (a huge bounce that hasn't reclaimed the long-term
  average must never be reported as bullish).
- **Alert engine** — every rule type, plus edge triggering, re-arming, cooldown
  suppression, one-shot rules, and malformed rules failing silently rather than
  throwing.
- **Watcher** — config validation (including the rule-references-an-unwatched-
  symbol case), quiet-hour windows that wrap past midnight, state surviving a
  restart, corrupt state degrading instead of crashing, and the Discord/Slack/
  JSON webhook payload shapes.
- **Static hosting** — the proxy probe latching off after a 404 but not after a
  transient error, and the all-routes-failed message naming a fix that works.

---

## Project layout

```
market-watch/
├── index.html              # app shell
├── server.js               # optional static server + stock proxy (zero deps)
├── watcher.js              # background watcher daemon
├── watcher.config.example.json
├── css/styles.css
├── js/
│   ├── app.js              # controller: polling loop, event wiring
│   ├── state.js            # localStorage persistence
│   ├── config-io.js        # export/import between app and watcher
│   ├── watcher/
│   │   ├── config.js       # config load + validation, quiet hours
│   │   ├── store.js        # durable rule state, atomic writes, event log
│   │   └── deliver.js      # desktop, speech, webhook, command channels
│   ├── util.js
│   ├── analysis/
│   │   ├── indicators.js   # SMA, EMA, RSI, MACD, ATR, drawdown, z-score
│   │   ├── regime.js       # bull/bear/correction/recovery/sideways
│   │   └── signals.js      # one pass from prices to everything the UI needs
│   ├── alerts/
│   │   ├── rules.js        # rule schema, evaluation, edge triggers, cooldown
│   │   └── notify.js       # toast, desktop notification, sound, speech
│   ├── providers/
│   │   ├── crypto.js       # CoinGecko
│   │   ├── stocks.js       # proxy → Alpha Vantage → Finnhub → Yahoo
│   │   ├── demo.js         # deterministic synthetic data
│   │   └── index.js        # facade
│   └── ui/
│       ├── charts.js       # inline SVG — sparklines, price chart, RSI, MACD
│       └── render.js
└── test/                   # node --test, no test framework needed
```

The analysis modules are plain ES modules with no DOM dependency, which is why
the same files run in the browser and under `node --test`.

---

## Accessibility notes

Regime colour is always paired with a glyph and a text label, so meaning never
depends on colour alone. Cards are keyboard-focusable and activate on
Enter/Space. The alert feed is an ARIA live region. `prefers-reduced-motion` is
respected.

---

## Not financial advice

Regime labels and momentum signals are mechanical readings of past prices. They
describe what has already happened; they do not predict what happens next. Data
may be delayed or wrong. Decide accordingly.
