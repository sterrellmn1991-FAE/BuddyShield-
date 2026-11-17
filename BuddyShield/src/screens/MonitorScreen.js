// src/screens/MonitorScreen.js

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Switch, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme';
import useStore from '../store/useStore';
import BuddyshieldNative from '../../modules/buddyshield-native/src/BuddyshieldNativeModule';

const TOP_DATA_USERS_COUNT = 5;

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// Mock activity log — replaced by real AppOpsManager data in production
const MOCK_ACTIVITY = [
  { id: '1', time: '2 min ago', app: 'Battery Saver X', action: 'Accessed your SMS messages', icon: '💬', risk: true },
  { id: '2', time: '8 min ago', app: 'FlashLight Pro', action: 'Turned on microphone', icon: '🎙️', risk: true },
  { id: '3', time: '15 min ago', app: 'Weather Now', action: 'Sent location data to server in Russia', icon: '📍', risk: true },
  { id: '4', time: '1 hr ago', app: 'Instagram', action: 'Accessed camera for story', icon: '📸', risk: false },
  { id: '5', time: '2 hr ago', app: 'Google Maps', action: 'Used location for navigation', icon: '🗺️', risk: false },
  { id: '6', time: '3 hr ago', app: 'Gmail', action: 'Synced email in background', icon: '📧', risk: false },
];

export default function MonitorScreen() {
  const { settings, updateSetting } = useStore();
  const privacyMode = settings.privacyMode;

  const flaggedCount = MOCK_ACTIVITY.filter(e => e.risk).length;

  const [dataUsage, setDataUsage] = useState(null); // null = not loaded, [] = loaded but empty
  const [needsUsageAccess, setNeedsUsageAccess] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      let cancelled = false;

      (async () => {
        try {
          if (!BuddyshieldNative.hasUsageAccess()) {
            if (!cancelled) setNeedsUsageAccess(true);
            return;
          }
          setNeedsUsageAccess(false);
          const usage = await BuddyshieldNative.getNetworkUsage(7);
          const top = [...usage]
            .sort((a, b) => (b.rxBytes + b.txBytes) - (a.rxBytes + a.txBytes))
            .slice(0, TOP_DATA_USERS_COUNT);
          if (!cancelled) setDataUsage(top);
        } catch {
          // Module unavailable (e.g. Expo Go) — leave the section hidden.
        }
      })();

      return () => { cancelled = true; };
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Live Monitor</Text>
        <Text style={styles.subtitle}>Real-time activity on your device.</Text>

        {/* Privacy Mode Card */}
        <TouchableOpacity
          style={[styles.privacyCard, privacyMode && styles.privacyCardActive]}
          onPress={() => updateSetting('privacyMode', !privacyMode)}
          activeOpacity={0.85}
        >
          <View style={styles.privacyLeft}>
            <Text style={styles.privacyTitle}>
              {privacyMode ? '🚨 Privacy Mode ON' : '🛡️ Privacy Mode'}
            </Text>
            <Text style={styles.privacyDesc}>
              {privacyMode
                ? 'All background access is blocked'
                : 'Tap to block all background app activity instantly'}
            </Text>
          </View>
          <Switch
            value={privacyMode}
            onValueChange={(val) => updateSetting('privacyMode', val)}
            trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(255,255,255,0.3)' }}
            thumbColor="white"
          />
        </TouchableOpacity>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: COLORS.dangerRed }]}>{flaggedCount}</Text>
            <Text style={styles.statLabel}>Flagged Today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: COLORS.successGreen }]}>
              {MOCK_ACTIVITY.length - flaggedCount}
            </Text>
            <Text style={styles.statLabel}>Normal Events</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: COLORS.shieldBlue }]}>
              {MOCK_ACTIVITY.length}
            </Text>
            <Text style={styles.statLabel}>Total Today</Text>
          </View>
        </View>

        {/* Data Usage (real, Android only) */}
        {Platform.OS === 'android' && needsUsageAccess && (
          <TouchableOpacity
            style={styles.usageBanner}
            onPress={() => BuddyshieldNative.openUsageAccessSettings()}
          >
            <Text style={styles.usageBannerTitle}>See which apps use the most data</Text>
            <Text style={styles.usageBannerDesc}>
              Grant Usage Access to enable the data usage analyzer.
            </Text>
            <Text style={styles.usageBannerCta}>Open Settings ›</Text>
          </TouchableOpacity>
        )}

        {dataUsage?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Usage (Last 7 Days)</Text>
            {dataUsage.map(entry => {
              const totalBytes = entry.rxBytes + entry.txBytes;
              const isHigh = totalBytes > 500 * 1024 * 1024;
              return (
                <View
                  key={entry.packageName}
                  style={[styles.dataCard, isHigh && styles.dataCardHigh]}
                >
                  <View style={styles.dataInfo}>
                    <Text style={styles.dataAppName} numberOfLines={1}>{entry.name}</Text>
                    <Text style={styles.dataPackage} numberOfLines={1}>{entry.packageName}</Text>
                  </View>
                  <Text style={[styles.dataAmount, isHigh && styles.dataAmountHigh]}>
                    {formatBytes(totalBytes)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Activity Feed */}
        <Text style={styles.sectionTitle}>Activity Log</Text>
        {MOCK_ACTIVITY.map(event => (
          <View
            key={event.id}
            style={[
              styles.eventCard,
              { borderLeftColor: event.risk ? COLORS.dangerRed : COLORS.successGreen },
            ]}
          >
            <Text style={styles.eventIcon}>{event.icon}</Text>
            <View style={styles.eventInfo}>
              <Text style={styles.eventApp}>{event.app}</Text>
              <Text style={[
                styles.eventAction,
                { color: event.risk ? COLORS.dangerRed : COLORS.muted }
              ]}>
                {event.action}
              </Text>
              <Text style={styles.eventTime}>{event.time}</Text>
            </View>
            {event.risk && (
              <View style={styles.flaggedBadge}>
                <Text style={styles.flaggedText}>FLAGGED</Text>
              </View>
            )}
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.lightBg },
  scroll: { padding: SPACING.md, gap: SPACING.md },
  title: { fontSize: 22, fontWeight: FONTS.black, color: COLORS.softNavy },
  subtitle: { fontSize: 13, color: COLORS.muted },
  privacyCard: {
    backgroundColor: COLORS.softNavy, borderRadius: RADIUS.xl,
    padding: SPACING.lg, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  privacyCardActive: { backgroundColor: COLORS.dangerRed },
  privacyLeft: { flex: 1, marginRight: SPACING.md },
  privacyTitle: { color: 'white', fontSize: 16, fontWeight: FONTS.black },
  privacyDesc: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.lg,
    padding: SPACING.md, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  statNum: { fontSize: 26, fontWeight: FONTS.black },
  statLabel: { fontSize: 11, color: COLORS.muted, marginTop: 2, textAlign: 'center' },
  section: { gap: SPACING.sm },
  sectionTitle: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.softNavy },
  usageBanner: {
    backgroundColor: COLORS.softNavy, borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  usageBannerTitle: { color: 'white', fontSize: 14, fontWeight: FONTS.bold },
  usageBannerDesc: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4, lineHeight: 17 },
  usageBannerCta: { color: COLORS.shieldBlue, fontSize: 12, fontWeight: FONTS.bold, marginTop: 8 },
  dataCard: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.lg,
    padding: SPACING.md, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    borderLeftWidth: 4, borderLeftColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  dataCardHigh: { borderLeftColor: COLORS.warnAmber },
  dataInfo: { flex: 1, marginRight: SPACING.sm },
  dataAppName: { fontSize: 13, fontWeight: FONTS.bold, color: COLORS.softNavy },
  dataPackage: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  dataAmount: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.shieldBlue },
  dataAmountHigh: { color: COLORS.warnAmber },
  eventCard: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.lg,
    padding: SPACING.md, flexDirection: 'row',
    alignItems: 'flex-start', gap: SPACING.sm,
    borderLeftWidth: 4, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  eventIcon: { fontSize: 24, marginTop: 2 },
  eventInfo: { flex: 1 },
  eventApp: { fontSize: 13, fontWeight: FONTS.bold, color: COLORS.softNavy },
  eventAction: { fontSize: 12, marginTop: 2 },
  eventTime: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  flaggedBadge: {
    backgroundColor: '#FFF0EE', borderRadius: RADIUS.sm,
    paddingVertical: 3, paddingHorizontal: 8,
  },
  flaggedText: { color: COLORS.dangerRed, fontSize: 10, fontWeight: FONTS.black },
});
