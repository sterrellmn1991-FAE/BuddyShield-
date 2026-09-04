/**
 * Inline SVG charts. No charting library — these are simple enough to draw
 * directly, and it keeps the app dependency-free and instantly loadable.
 *
 * Colour is never the only signal: every chart pairs its colour with a
 * label or shape, so the app stays readable for colourblind users.
 */

import { isFiniteNumber, formatPrice } from '../util.js';

const REGIME_COLORS = {
  bull: 'var(--bull)',
  bear: 'var(--bear)',
  correction: 'var(--warn)',
  recovery: 'var(--info)',
  sideways: 'var(--muted)',
  unknown: 'var(--muted)',
};

export function regimeColor(regime) {
  return REGIME_COLORS[regime] || 'var(--muted)';
}

function scale(values, width, height, pad = 2) {
  const clean = values.filter(isFiniteNumber);
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  return {
    x: (i, n) => (i / Math.max(1, n - 1)) * width,
    y: (v) => pad + (1 - (v - min) / span) * (height - pad * 2),
    min, max,
  };
}

/**
 * Compact sparkline for a watchlist card.
 * Draws the price line plus a soft area fill, tinted by regime.
 */
export function sparkline(closes, regime, width = 240, height = 56) {
  const values = (closes || []).filter(isFiniteNumber);
  if (values.length < 2) {
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="No chart data"></svg>`;
  }
  // Cap the point count so a 500-bar series does not produce a giant path.
  const step = Math.max(1, Math.floor(values.length / width));
  const pts = values.filter((_, i) => i % step === 0);
  const s = scale(pts, width, height);
  const color = regimeColor(regime);

  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${s.x(i, pts.length).toFixed(1)},${s.y(v).toFixed(1)}`).join('');
  const area = `${line}L${width},${height}L0,${height}Z`;
  const gradId = `g${Math.random().toString(36).slice(2, 8)}`;

  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
    aria-label="Price trend, ${regime} regime">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${gradId})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.8"
      stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/**
 * Detail chart: price with the 50- and long-term moving averages overlaid,
 * which is the visual form of the regime verdict.
 */
export function priceChart(analysis, width = 720, height = 260) {
  const closes = (analysis?.series?.closes || []).filter(isFiniteNumber);
  if (closes.length < 2) return '<p class="empty">Not enough price history to chart.</p>';

  const pad = { top: 14, right: 58, bottom: 22, left: 8 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const sma50 = analysis.series.sma50 || [];
  const sma200 = analysis.series.sma200 || [];

  const all = [...closes, ...sma50.filter(isFiniteNumber), ...sma200.filter(isFiniteNumber)];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const X = (i) => pad.left + (i / (closes.length - 1)) * w;
  const Y = (v) => pad.top + (1 - (v - min) / span) * h;

  const path = (series, cls) => {
    let d = '';
    let started = false;
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (!isFiniteNumber(v)) { started = false; continue; }
      d += `${started ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      started = true;
    }
    return d ? `<path d="${d}" class="${cls}" fill="none"/>` : '';
  };

  // Horizontal guides at 0/50/100% of the visible range.
  const guides = [0, 0.5, 1].map((f) => {
    const v = min + span * f;
    const y = Y(v);
    return `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${pad.left + w}" y2="${y.toFixed(1)}" class="chart__guide"/>
      <text x="${pad.left + w + 6}" y="${(y + 3.5).toFixed(1)}" class="chart__axis">${formatPrice(v)}</text>`;
  }).join('');

  const color = regimeColor(analysis.regime.regime);

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img"
      aria-label="Price with 50-day and long-term moving averages">
    ${guides}
    ${path(sma200, 'chart__ma chart__ma--long')}
    ${path(sma50, 'chart__ma chart__ma--short')}
    <path d="${(() => {
      let d = '';
      for (let i = 0; i < closes.length; i++) d += `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(closes[i]).toFixed(1)}`;
      return d;
    })()}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linejoin="round"/>
  </svg>
  <div class="chart__legend">
    <span class="legend__item"><span class="legend__swatch" style="background:${color}"></span>Price</span>
    <span class="legend__item"><span class="legend__swatch legend__swatch--dash-short"></span>50-day avg</span>
    <span class="legend__item"><span class="legend__swatch legend__swatch--dash-long"></span>${analysis.regime.metrics.longMaPeriod || 200}-day avg</span>
  </div>`;
}

/**
 * RSI gauge: a 0-100 track with the overbought/oversold bands marked, so the
 * number has visible context rather than being a bare figure.
 */
export function rsiGauge(rsi, width = 220, height = 34) {
  if (!isFiniteNumber(rsi)) return '<p class="empty">RSI needs at least 15 bars.</p>';
  const x = (v) => (v / 100) * width;
  return `<svg class="gauge" viewBox="0 0 ${width} ${height}" role="img" aria-label="RSI ${rsi.toFixed(0)} of 100">
    <rect x="0" y="12" width="${width}" height="8" rx="4" class="gauge__track"/>
    <rect x="0" y="12" width="${x(30)}" height="8" class="gauge__zone gauge__zone--over"/>
    <rect x="${x(70)}" y="12" width="${width - x(70)}" height="8" class="gauge__zone gauge__zone--under"/>
    <circle cx="${x(rsi).toFixed(1)}" cy="16" r="6" class="gauge__dot"/>
    <text x="0" y="32" class="gauge__label">0</text>
    <text x="${x(30).toFixed(1)}" y="32" class="gauge__label" text-anchor="middle">30</text>
    <text x="${x(70).toFixed(1)}" y="32" class="gauge__label" text-anchor="middle">70</text>
    <text x="${width}" y="32" class="gauge__label" text-anchor="end">100</text>
  </svg>`;
}

/** MACD histogram: bar chart of momentum, zero line centred. */
export function macdChart(analysis, width = 220, height = 60) {
  const hist = (analysis?.series?.macd?.histogram || []).filter(isFiniteNumber).slice(-60);
  if (hist.length < 2) return '<p class="empty">MACD needs at least 35 bars.</p>';
  const maxAbs = Math.max(...hist.map(Math.abs)) || 1;
  const mid = height / 2;
  const bw = width / hist.length;

  const bars = hist.map((v, i) => {
    const bh = Math.max(1, (Math.abs(v) / maxAbs) * (mid - 4));
    const y = v >= 0 ? mid - bh : mid;
    return `<rect x="${(i * bw).toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1, bw - 0.7).toFixed(2)}"
      height="${bh.toFixed(2)}" class="macd__bar macd__bar--${v >= 0 ? 'up' : 'down'}"/>`;
  }).join('');

  return `<svg class="macd" viewBox="0 0 ${width} ${height}" role="img"
      aria-label="MACD histogram, last ${hist.length} bars">
    ${bars}
    <line x1="0" y1="${mid}" x2="${width}" y2="${mid}" class="macd__zero"/>
  </svg>`;
}
