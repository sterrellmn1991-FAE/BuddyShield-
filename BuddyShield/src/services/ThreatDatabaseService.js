// src/services/ThreatDatabaseService.js
// Manages local threat database — syncs from backend every 24 hours
// Local SQLite cache means the app works offline

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE_URL } from '../constants/api';

const DB_KEY = 'buddyshield_threat_db';
const LAST_SYNC_KEY = 'buddyshield_last_sync';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

class ThreatDatabaseService {

  // ─── Get Local Database ──────────────────────────────────────────────────
  // Returns cached database, triggers background sync if stale
  async getLocalDatabase() {
    try {
      const raw = await AsyncStorage.getItem(DB_KEY);
      const db = raw ? JSON.parse(raw) : SEED_THREAT_DATABASE;

      // Trigger background sync if database is stale
      this._syncIfStale();

      return db;
    } catch (error) {
      console.error('ThreatDB: Failed to load local database', error);
      return SEED_THREAT_DATABASE;
    }
  }

  // ─── Sync If Stale ───────────────────────────────────────────────────────
  async _syncIfStale() {
    try {
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const now = Date.now();

      if (!lastSync || now - parseInt(lastSync) > SYNC_INTERVAL_MS) {
        await this.syncFromServer();
      }
    } catch (error) {
      console.error('ThreatDB: Sync check failed', error);
    }
  }

  // ─── Sync From Server ────────────────────────────────────────────────────
  async syncFromServer() {
    try {
      const response = await axios.get(`${API_BASE_URL}/threats/database`, {
        timeout: 10000,
      });

      if (response.data?.threats) {
        await AsyncStorage.setItem(DB_KEY, JSON.stringify(response.data.threats));
        await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
        console.log(`ThreatDB: Synced ${response.data.threats.length} threats`);
      }
    } catch (error) {
      // Silent fail — local database still works
      console.warn('ThreatDB: Server sync failed, using local cache', error.message);
    }
  }

  // ─── Check Single Package ────────────────────────────────────────────────
  async checkPackage(packageName) {
    const db = await this.getLocalDatabase();
    return db.find(t => t.packageName === packageName) || null;
  }

  // ─── Get Threat Count ────────────────────────────────────────────────────
  async getThreatCount() {
    const db = await this.getLocalDatabase();
    return db.length;
  }
}

// ─── Seed Database ────────────────────────────────────────────────────────
// Known stalkerware and spyware package names
// This list is seeded from open-source stalkerware registries
// Updated via server sync in production
const SEED_THREAT_DATABASE = [
  {
    packageName: 'com.flexispy.android',
    name: 'FlexiSpy',
    threatType: 'stalkerware',
    riskLevel: 'critical',
    description: 'Commercial stalkerware. Records calls, texts, and location secretly.',
    source: 'Coalition Against Stalkerware',
  },
  {
    packageName: 'com.mspy.android',
    name: 'mSpy',
    threatType: 'stalkerware',
    riskLevel: 'critical',
    description: 'Tracks location, messages, and app usage without notification.',
    source: 'Exodus Privacy',
  },
  {
    packageName: 'com.hoverwatch',
    name: 'Hoverwatch',
    threatType: 'stalkerware',
    riskLevel: 'critical',
    description: 'Hidden tracking app. Captures screenshots and keystrokes.',
    source: 'Coalition Against Stalkerware',
  },
  {
    packageName: 'com.ikeymonitor.android',
    name: 'iKeyMonitor',
    threatType: 'keylogger',
    riskLevel: 'critical',
    description: 'Keylogger that captures everything typed on your device.',
    source: 'MalwareBazaar',
  },
  {
    packageName: 'com.spyic.android',
    name: 'Spyic',
    threatType: 'stalkerware',
    riskLevel: 'critical',
    description: 'Remote monitoring tool disguised as a parental control app.',
    source: 'Exodus Privacy',
  },
  {
    packageName: 'com.cocospy.app',
    name: 'Cocospy',
    threatType: 'stalkerware',
    riskLevel: 'critical',
    description: 'Stealth monitoring app that hides its icon after installation.',
    source: 'Coalition Against Stalkerware',
  },
  {
    packageName: 'org.spynote',
    name: 'SpyNote RAT',
    threatType: 'remote_access_trojan',
    riskLevel: 'critical',
    description: 'Remote access trojan. Gives attacker full control of your device.',
    source: 'MalwareBazaar',
  },
];

export default new ThreatDatabaseService();
