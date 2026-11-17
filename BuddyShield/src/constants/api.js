// src/constants/api.js
// All API endpoints and configuration in one place

export const API_BASE_URL = __DEV__
  ? 'http://localhost:3000/api/v1'        // Local dev server
  : 'https://api.buddyshield.app/api/v1'; // Production server

export const ENDPOINTS = {
  // Auth
  register:       '/auth/register',
  login:          '/auth/login',
  refreshToken:   '/auth/refresh',

  // Scan
  submitScan:     '/scans/submit',
  getScanHistory: '/scans/history',

  // Threats
  threatDatabase: '/threats/database',
  reportThreat:   '/threats/report',

  // Subscription
  verifyPurchase: '/billing/verify',
  getSubStatus:   '/billing/status',

  // User
  getProfile:     '/user/profile',
  updateSettings: '/user/settings',
};

export const REQUEST_TIMEOUT = 10000; // 10 seconds
