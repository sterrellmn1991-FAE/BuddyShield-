# Market Watch

A browser app that watches stocks and crypto, alerts you when a price target or
a move is hit, and tells you — with its reasoning shown — whether each market is
bullish, bearish, correcting, recovering, or going nowhere.

No build step, no framework, no dependencies. Open it and it runs.

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

## Tests

```bash
cd market-watch
npm test
```

54 tests covering the parts where a quiet bug costs money:

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

---

## Project layout

```
market-watch/
├── index.html              # app shell
├── server.js               # optional static server + stock proxy (zero deps)
├── css/styles.css
├── js/
│   ├── app.js              # controller: polling loop, event wiring
│   ├── state.js            # localStorage persistence
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
