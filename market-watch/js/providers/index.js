/**
 * Provider facade. The rest of the app asks for "a symbol" and gets back a
 * uniform shape, regardless of which service answered.
 */

import { fetchCrypto } from './crypto.js';
import { fetchStock } from './stocks.js';
import { fetchDemo } from './demo.js';

/**
 * @param {{symbol:string, assetType:'stock'|'crypto'}} watchItem
 * @param {object} settings
 * @returns {Promise<object>} normalised asset payload
 */
export async function fetchAsset(watchItem, settings = {}, signal) {
  const { symbol, assetType } = watchItem;

  if (settings.demoMode) return fetchDemo(symbol, assetType);

  if (assetType === 'crypto') {
    return fetchCrypto(symbol, { apiKey: settings.coinGeckoKey, signal });
  }
  return fetchStock(symbol, {
    alphaVantageKey: settings.alphaVantageKey,
    finnhubKey: settings.finnhubKey,
    signal,
  });
}
