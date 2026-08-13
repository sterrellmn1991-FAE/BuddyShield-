// src/constants/theme.js
// BuddyShield Design System — all colors, spacing, typography in one place

export const COLORS = {
  // Primary
  shieldBlue: '#1A73E8',
  softNavy: '#0D1B2A',
  lightBg: '#F0F4FF',
  cardWhite: '#FFFFFF',

  // Status
  successGreen: '#34C759',
  warnAmber: '#FF9500',
  dangerRed: '#FF3B30',
  highRisk: '#FF6B35',
  muted: '#8E9BAE',

  // Gradients (used as array pairs)
  gradientNavy: ['#0D1B2A', '#1A2E4A'],
  gradientPro: ['#667EEA', '#764BA2'],
  gradientDanger: ['#FF3B30', '#C0392B'],
};

export const FONTS = {
  black: '800',
  bold: '700',
  semibold: '600',
  medium: '500',
  regular: '400',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const RISK_LEVELS = {
  critical: { label: 'CRITICAL', color: COLORS.dangerRed },
  high: { label: 'HIGH RISK', color: COLORS.highRisk },
  medium: { label: 'WATCH', color: COLORS.warnAmber },
  safe: { label: 'SAFE', color: COLORS.successGreen },
};

export const PERMISSIONS_RISK_MATRIX = {
  // CRITICAL — these should almost never be needed by utility apps
  READ_SMS: 'critical',
  RECEIVE_SMS: 'critical',
  RECORD_AUDIO: 'critical',
  READ_CALL_LOG: 'critical',
  PROCESS_OUTGOING_CALLS: 'critical',
  BIND_DEVICE_ADMIN: 'critical',

  // HIGH — sensitive but sometimes legitimate
  ACCESS_FINE_LOCATION: 'high',
  CAMERA: 'high',
  READ_CONTACTS: 'high',
  READ_PHONE_STATE: 'high',
  WRITE_SETTINGS: 'high',

  // MEDIUM — common but worth noting
  ACCESS_COARSE_LOCATION: 'medium',
  READ_EXTERNAL_STORAGE: 'medium',
  WRITE_EXTERNAL_STORAGE: 'medium',
  ACCESS_WIFI_STATE: 'medium',
};
