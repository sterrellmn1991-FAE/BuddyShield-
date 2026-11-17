// src/services/ScanService.js
// Core scanning logic — interfaces with native Android APIs via RN modules

import { Platform } from 'react-native';
import BuddyshieldNative from '../../modules/buddyshield-native/src/BuddyshieldNativeModule';
import { PERMISSIONS_RISK_MATRIX } from '../constants/theme';
import ThreatDatabaseService from './ThreatDatabaseService';

const HIGH_DATA_USAGE_BYTES = 500 * 1024 * 1024; // 500 MB over the trailing 7 days

// ─── Known legitimate system package prefixes ─────────────────────────────
const TRUSTED_SYSTEM_PREFIXES = [
  'com.google.android',
  'com.android',
  'com.samsung',
  'android.auto',
  'com.sec.android',
];

// ─── App category → expected permissions map ──────────────────────────────
const CATEGORY_PERMISSION_RULES = {
  TOOLS: {
    never: ['READ_SMS', 'RECORD_AUDIO', 'READ_CALL_LOG', 'READ_CONTACTS'],
    suspicious: ['ACCESS_FINE_LOCATION', 'CAMERA'],
  },
  PERSONALIZATION: {
    never: ['READ_SMS', 'READ_CALL_LOG', 'PROCESS_OUTGOING_CALLS'],
    suspicious: ['RECORD_AUDIO', 'ACCESS_FINE_LOCATION'],
  },
  PRODUCTIVITY: {
    never: ['RECORD_AUDIO', 'READ_CALL_LOG'],
    suspicious: ['READ_SMS', 'CAMERA'],
  },
};

class ScanService {

  // ─── Main Scan Entry Point ───────────────────────────────────────────────
  async runFullScan(onProgress) {
    const stages = [
      { label: 'Loading installed apps...', fn: () => this._getInstalledApps() },
      { label: 'Checking permissions...', fn: (apps) => this._scanPermissions(apps) },
      { label: 'Checking threat database...', fn: (apps) => this._checkThreatDatabase(apps) },
      { label: 'Detecting impersonators...', fn: (apps) => this._detectImpersonators(apps) },
      { label: 'Analyzing behavior patterns...', fn: (apps) => this._analyzeBehavior(apps) },
      { label: 'Checking network activity...', fn: (apps) => this._checkNetworkActivity(apps) },
      { label: 'Building your report...', fn: (apps) => this._buildFinalReport(apps) },
    ];

    let apps = [];
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const progress = Math.round(((i + 1) / stages.length) * 100);
      onProgress?.(progress, stage.label);

      // Small delay so progress feels real to the user
      await this._delay(400);

      if (i === 0) {
        apps = await stage.fn();
      } else {
        apps = await stage.fn(apps);
      }
    }

    return apps;
  }

  // ─── Step 1: Get Installed Apps ──────────────────────────────────────────
  // Uses the BuddyshieldNative module (PackageManager.getInstalledPackages)
  // on Android. Falls back to mock data on iOS/web or if the native call
  // fails for any reason, so the UI always has something to render.
  async _getInstalledApps() {
    if (Platform.OS === 'android') {
      try {
        const apps = await BuddyshieldNative.getInstalledApps();
        if (apps?.length) return apps;
      } catch (error) {
        console.warn('ScanService: native getInstalledApps failed, using mock data', error.message);
      }
    }
    return MOCK_INSTALLED_APPS;
  }

  // ─── Step 2: Permission Scanner ──────────────────────────────────────────
  async _scanPermissions(apps) {
    return apps.map(app => {
      const permissionFlags = [];
      let highestRisk = 'safe';

      app.permissions?.forEach(permission => {
        const riskLevel = PERMISSIONS_RISK_MATRIX[permission];
        if (riskLevel) {
          permissionFlags.push({ permission, riskLevel });
          if (riskLevel === 'critical') highestRisk = 'critical';
          else if (riskLevel === 'high' && highestRisk !== 'critical') highestRisk = 'high';
          else if (riskLevel === 'medium' && highestRisk === 'safe') highestRisk = 'medium';
        }
      });

      // Cross-reference with category rules
      const categoryRules = CATEGORY_PERMISSION_RULES[app.category];
      if (categoryRules) {
        categoryRules.never?.forEach(perm => {
          if (app.permissions?.includes(perm)) {
            highestRisk = 'critical';
            permissionFlags.push({
              permission: perm,
              riskLevel: 'critical',
              reason: `${app.category} apps should never need ${perm}`,
            });
          }
        });
      }

      return { ...app, permissionFlags, riskFromPermissions: highestRisk };
    });
  }

  // ─── Step 3: Threat Database Check ───────────────────────────────────────
  async _checkThreatDatabase(apps) {
    const threatDb = await ThreatDatabaseService.getLocalDatabase();

    return apps.map(app => {
      const threat = threatDb.find(t => t.packageName === app.packageName);
      if (threat) {
        return {
          ...app,
          knownThreat: true,
          threatDetails: threat,
          risk: 'critical',
          reason: threat.description,
        };
      }
      return { ...app, knownThreat: false };
    });
  }

  // ─── Step 4: Impersonation Detection ─────────────────────────────────────
  async _detectImpersonators(apps) {
    return apps.map(app => {
      const claimsToBeSystem = app.packageName?.startsWith('com.android') ||
        app.packageName?.startsWith('com.samsung') ||
        app.name?.toLowerCase().includes('settings') ||
        app.name?.toLowerCase().includes('system');

      const isTrusted = TRUSTED_SYSTEM_PREFIXES.some(prefix =>
        app.packageName?.startsWith(prefix)
      );

      if (claimsToBeSystem && !isTrusted && !app.isSystemApp) {
        return {
          ...app,
          isImpersonator: true,
          risk: 'critical',
          reason: `This app claims to be a system app but is NOT verified. This is a major red flag.`,
        };
      }

      return { ...app, isImpersonator: false };
    });
  }

  // ─── Step 5: Behavior Analysis ───────────────────────────────────────────
  // Uses UsageStatsManager data from the native module when the user has
  // granted "Usage access" (a special permission only grantable from
  // Settings — see BuddyshieldNative.openUsageAccessSettings()). Falls
  // back to the mocked backgroundWakeUps heuristic otherwise.
  async _analyzeBehavior(apps) {
    if (Platform.OS === 'android') {
      try {
        if (BuddyshieldNative.hasUsageAccess()) {
          const usage = await BuddyshieldNative.getUsageStats(30);
          const usageByPackage = Object.fromEntries(usage.map(u => [u.packageName, u]));
          return apps.map(app => {
            const stat = usageByPackage[app.packageName];
            const hoursInForeground = stat ? stat.totalTimeInForegroundMs / 3600000 : 0;
            if (hoursInForeground > 20) {
              return {
                ...app,
                behaviorFlag: true,
                behaviorReason: `Ran in the foreground for ${hoursInForeground.toFixed(1)} hours in the last 30 days — unusually high.`,
              };
            }
            return { ...app, behaviorFlag: false };
          });
        }
      } catch (error) {
        console.warn('ScanService: usage stats unavailable, skipping behavior analysis', error.message);
      }
    }

    // Mock-data fallback — flags apps with excessive background wake-ups
    return apps.map(app => {
      if (app.backgroundWakeUps > 500) {
        return {
          ...app,
          behaviorFlag: true,
          behaviorReason: `Woke up in the background ${app.backgroundWakeUps} times in 30 days — unusually high.`,
        };
      }
      return { ...app, behaviorFlag: false };
    });
  }

  // ─── Step 6: Network Activity Check ─────────────────────────────────────
  // Uses NetworkStatsManager data from the native module (per-app bytes
  // sent/received — no VpnService involved) when Usage access is granted.
  // This flags apps moving an unusual amount of data; it can't identify
  // *which* servers/domains they talked to — that would require a local
  // VPN capturing all device traffic, a much higher-risk feature that
  // isn't built yet (see BuddyShield/README.md).
  async _checkNetworkActivity(apps) {
    if (Platform.OS === 'android') {
      try {
        if (BuddyshieldNative.hasUsageAccess()) {
          const usage = await BuddyshieldNative.getNetworkUsage(7);
          const usageByPackage = Object.fromEntries(usage.map(u => [u.packageName, u]));
          return apps.map(app => {
            const stat = usageByPackage[app.packageName];
            if (!stat) return { ...app, networkFlag: false };
            const totalBytes = stat.rxBytes + stat.txBytes;
            const totalMB = totalBytes / (1024 * 1024);
            if (totalBytes > HIGH_DATA_USAGE_BYTES) {
              return {
                ...app,
                networkFlag: true,
                networkReason: `Used ${totalMB.toFixed(0)} MB of data in the last 7 days — unusually high.`,
                dataUsageBytes: totalBytes,
              };
            }
            return { ...app, networkFlag: false, dataUsageBytes: totalBytes };
          });
        }
      } catch (error) {
        console.warn('ScanService: network usage unavailable, skipping network check', error.message);
      }
    }

    // Mock-data fallback
    try {
      return apps.map(app => {
        if (app.suspiciousConnections?.length > 0) {
          return {
            ...app,
            networkFlag: true,
            networkReason: `Sending data to ${app.suspiciousConnections.join(', ')}`,
          };
        }
        return { ...app, networkFlag: false };
      });
    } catch (error) {
      console.error('ScanService: Network check failed', error);
      return apps;
    }
  }

  // ─── Step 7: Build Final Report ───────────────────────────────────────────
  async _buildFinalReport(apps) {
    return apps.map(app => {
      // Determine final risk level — worst flag wins
      let finalRisk = app.riskFromPermissions || 'safe';
      if (app.knownThreat) finalRisk = 'critical';
      if (app.isImpersonator) finalRisk = 'critical';
      if (app.networkFlag && finalRisk === 'safe') finalRisk = 'medium';
      if (app.behaviorFlag && finalRisk === 'safe') finalRisk = 'medium';

      // Build plain-language explanation
      let reason = app.reason || '';
      if (!reason) {
        if (app.permissionFlags?.length > 0) {
          const criticalPerms = app.permissionFlags
            .filter(f => f.riskLevel === 'critical')
            .map(f => f.permission);
          if (criticalPerms.length > 0) {
            reason = `Has access to: ${criticalPerms.join(', ')}. Most ${app.category?.toLowerCase() || ''} apps don't need this.`;
          }
        }
        if (!reason) reason = 'No issues found.';
      }

      return {
        ...app,
        risk: finalRisk,
        reason,
        scannedAt: new Date().toISOString(),
      };
    });
  }

  // ─── Utility ─────────────────────────────────────────────────────────────
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Development Mock Data ────────────────────────────────────────────────
// Replace with real PackageManager data in production build
const MOCK_INSTALLED_APPS = [
  {
    name: 'FlashLight Pro',
    packageName: 'com.flashlight.pro',
    icon: '🔦',
    category: 'TOOLS',
    isSystemApp: false,
    permissions: ['RECORD_AUDIO', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'CAMERA'],
    backgroundWakeUps: 12,
    suspiciousConnections: [],
  },
  {
    name: 'Battery Saver X',
    packageName: 'com.batterysaver.x',
    icon: '🔋',
    category: 'TOOLS',
    isSystemApp: false,
    permissions: ['READ_SMS', 'READ_CALL_LOG'],
    backgroundWakeUps: 847,
    suspiciousConnections: [],
  },
  {
    name: 'System Settings Manager',
    packageName: 'com.systemsettings.manager',
    icon: '⚙️',
    category: 'TOOLS',
    isSystemApp: false,
    permissions: ['BIND_DEVICE_ADMIN', 'READ_SMS', 'RECORD_AUDIO'],
    backgroundWakeUps: 220,
    suspiciousConnections: ['185.234.218.22'],
  },
  {
    name: 'Weather Now',
    packageName: 'com.weather.now',
    icon: '🌤️',
    category: 'PRODUCTIVITY',
    isSystemApp: false,
    permissions: ['ACCESS_FINE_LOCATION'],
    backgroundWakeUps: 48,
    suspiciousConnections: ['91.108.4.0'],
  },
  {
    name: 'Google Maps',
    packageName: 'com.google.android.apps.maps',
    icon: '🗺️',
    category: 'NAVIGATION',
    isSystemApp: false,
    permissions: ['ACCESS_FINE_LOCATION', 'CAMERA'],
    backgroundWakeUps: 15,
    suspiciousConnections: [],
  },
  {
    name: 'Instagram',
    packageName: 'com.instagram.android',
    icon: '📸',
    category: 'SOCIAL',
    isSystemApp: false,
    permissions: ['CAMERA', 'RECORD_AUDIO', 'READ_EXTERNAL_STORAGE'],
    backgroundWakeUps: 92,
    suspiciousConnections: [],
  },
];

export default new ScanService();
