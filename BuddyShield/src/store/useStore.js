// src/store/useStore.js
// Global state management using Zustand — lightweight, no boilerplate

import { create } from 'zustand';

const useStore = create((set, get) => ({

  // ─── User ───────────────────────────────────────────────
  user: null,
  isPro: false,
  setUser: (user) => set({ user }),
  setIsPro: (isPro) => set({ isPro }),

  // ─── Shield Score ────────────────────────────────────────
  shieldScore: null,
  lastScanDate: null,
  setShieldScore: (score) => set({ shieldScore: score }),
  setLastScanDate: (date) => set({ lastScanDate: date }),

  // Dynamically calculate score from scan results
  calculateScore: () => {
    const { scanResults } = get();
    if (!scanResults.length) return 100;
    let score = 100;
    scanResults.forEach(app => {
      if (app.risk === 'critical') score -= 25;
      else if (app.risk === 'high') score -= 15;
      else if (app.risk === 'medium') score -= 8;
    });
    const finalScore = Math.max(0, score);
    set({ shieldScore: finalScore });
    return finalScore;
  },

  // ─── Scan Results ────────────────────────────────────────
  scanResults: [],
  isScanning: false,
  scanProgress: 0,
  scanStage: '',
  setScanResults: (results) => set({ scanResults: results }),
  setIsScanning: (val) => set({ isScanning: val }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
  setScanStage: (stage) => set({ scanStage: stage }),

  // ─── Activity Log ────────────────────────────────────────
  activityLog: [],
  addActivityEvent: (event) =>
    set((state) => ({
      activityLog: [event, ...state.activityLog].slice(0, 100), // keep last 100
    })),
  clearActivityLog: () => set({ activityLog: [] }),

  // ─── Settings ────────────────────────────────────────────
  settings: {
    autoScanEnabled: true,
    realTimeAlerts: true,
    covertMode: false,
    privacyMode: false,
    scanFrequencyHours: 24,
  },
  updateSetting: (key, value) =>
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    })),

  // ─── Notifications ───────────────────────────────────────
  unreadAlerts: 0,
  incrementAlerts: () => set((state) => ({ unreadAlerts: state.unreadAlerts + 1 })),
  clearAlerts: () => set({ unreadAlerts: 0 }),
}));

export default useStore;
