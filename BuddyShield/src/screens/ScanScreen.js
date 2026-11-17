// src/screens/ScanScreen.js

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS, RISK_LEVELS } from '../constants/theme';
import useStore from '../store/useStore';
import ScanService from '../services/ScanService';
import AppIcon from '../components/AppIcon';
import BuddyshieldNative from '../../modules/buddyshield-native/src/BuddyshieldNativeModule';

const SCAN_STATES = { idle: 'idle', scanning: 'scanning', done: 'done' };

export default function ScanScreen() {
  const {
    setScanResults, setShieldScore, calculateScore,
    setLastScanDate, setIsScanning, scanResults,
  } = useStore();

  const [scanState, setScanState] = useState(SCAN_STATES.idle);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [selectedApp, setSelectedApp] = useState(null);
  const [hasUsageAccess, setHasUsageAccess] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'android') {
        try {
          setHasUsageAccess(BuddyshieldNative.hasUsageAccess());
        } catch {
          setHasUsageAccess(true); // module unavailable (e.g. Expo Go) — hide the banner
        }
      }
    }, [])
  );

  const startScan = async () => {
    setScanState(SCAN_STATES.scanning);
    setProgress(0);
    setSelectedApp(null);
    setIsScanning(true);

    try {
      const results = await ScanService.runFullScan((pct, label) => {
        setProgress(pct);
        setStage(label);
      });

      setScanResults(results);
      setLastScanDate(new Date().toISOString());
      const score = calculateScore();
      setShieldScore(score);
      setScanState(SCAN_STATES.done);
    } catch (error) {
      console.error('Scan failed:', error);
      setScanState(SCAN_STATES.idle);
    } finally {
      setIsScanning(false);
    }
  };

  const criticalCount = scanResults.filter(a => a.risk === 'critical').length;
  const highCount = scanResults.filter(a => a.risk === 'high').length;
  const safeCount = scanResults.filter(a => a.risk === 'safe').length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Full Scan</Text>
        <Text style={styles.subtitle}>We check everything so you don&apos;t have to.</Text>

        {/* Idle State */}
        {scanState === SCAN_STATES.idle && (
          <View style={styles.idleContainer}>
            {!hasUsageAccess && (
              <TouchableOpacity
                style={styles.usageBanner}
                onPress={() => BuddyshieldNative.openUsageAccessSettings()}
              >
                <Text style={styles.usageBannerTitle}>Enable full scanning</Text>
                <Text style={styles.usageBannerDesc}>
                  Grant Usage Access so BuddyShield can spot apps with unusually high background activity.
                </Text>
                <Text style={styles.usageBannerCta}>Open Settings ›</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.idleIcon}>🛡️</Text>
            <Text style={styles.idleTitle}>Ready to scan your device</Text>
            <Text style={styles.idleDesc}>Takes about 30 seconds</Text>
            <TouchableOpacity style={styles.startBtn} onPress={startScan}>
              <Text style={styles.startBtnText}>Start Scan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scanning State */}
        {scanState === SCAN_STATES.scanning && (
          <View style={styles.scanningContainer}>
            <Text style={styles.scanningIcon}>🔍</Text>
            <Text style={styles.scanningTitle}>Scanning...</Text>
            <Text style={styles.scanningStage}>{stage}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressPct}>{progress}%</Text>
          </View>
        )}

        {/* Done State */}
        {scanState === SCAN_STATES.done && (
          <View style={styles.resultsContainer}>
            {/* Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Scan Complete</Text>
              <Text style={styles.summaryTitle}>
                {criticalCount + highCount} Issue{criticalCount + highCount !== 1 ? 's' : ''} Found
              </Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryNum, { color: COLORS.dangerRed }]}>{criticalCount}</Text>
                  <Text style={styles.summaryItemLabel}>Critical</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryNum, { color: COLORS.highRisk }]}>{highCount}</Text>
                  <Text style={styles.summaryItemLabel}>High Risk</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryNum, { color: COLORS.successGreen }]}>{safeCount}</Text>
                  <Text style={styles.summaryItemLabel}>Safe</Text>
                </View>
              </View>
            </View>

            {/* App List */}
            <Text style={styles.sectionTitle}>All Apps ({scanResults.length})</Text>
            {scanResults.map(app => (
              <View key={app.packageName}>
                <TouchableOpacity
                  style={[styles.appCard, { borderLeftColor: RISK_LEVELS[app.risk].color }]}
                  onPress={() => setSelectedApp(selectedApp?.packageName === app.packageName ? null : app)}
                >
                  <AppIcon icon={app.icon} size={26} style={styles.appIcon} />
                  <View style={styles.appInfo}>
                    <Text style={styles.appName}>{app.name}</Text>
                    <Text style={styles.appPackage} numberOfLines={1}>{app.packageName}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: RISK_LEVELS[app.risk].color }]}>
                    <Text style={styles.badgeText}>{RISK_LEVELS[app.risk].label}</Text>
                  </View>
                </TouchableOpacity>

                {/* Expanded Detail */}
                {selectedApp?.packageName === app.packageName && (
                  <View style={styles.expandedCard}>
                    <Text style={styles.expandedLabel}>What we found:</Text>
                    <Text style={styles.expandedReason}>{app.reason}</Text>
                    {app.permissionFlags?.length > 0 && (
                      <>
                        <Text style={styles.expandedLabel}>Flagged permissions:</Text>
                        <View style={styles.permissionRow}>
                          {app.permissionFlags.map(f => (
                            <View key={f.permission} style={styles.permChip}>
                              <Text style={styles.permChipText}>{f.permission}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    )}
                    {app.risk !== 'safe' && (
                      <TouchableOpacity style={styles.removeBtn}>
                        <Text style={styles.removeBtnText}>Remove This App</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}

            <TouchableOpacity style={styles.rescanBtn} onPress={startScan}>
              <Text style={styles.rescanBtnText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.lightBg },
  scroll: { padding: SPACING.md, gap: SPACING.md },
  title: { fontSize: 22, fontWeight: FONTS.black, color: COLORS.softNavy },
  subtitle: { fontSize: 13, color: COLORS.muted },
  idleContainer: { alignItems: 'center', paddingVertical: 48 },
  usageBanner: {
    backgroundColor: COLORS.softNavy, borderRadius: RADIUS.lg,
    padding: SPACING.md, width: '100%', marginBottom: SPACING.lg,
  },
  usageBannerTitle: { color: 'white', fontSize: 14, fontWeight: FONTS.bold },
  usageBannerDesc: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4, lineHeight: 17 },
  usageBannerCta: { color: COLORS.shieldBlue, fontSize: 12, fontWeight: FONTS.bold, marginTop: 8 },
  idleIcon: { fontSize: 80 },
  idleTitle: { fontSize: 18, fontWeight: FONTS.bold, color: COLORS.softNavy, marginTop: 16 },
  idleDesc: { fontSize: 13, color: COLORS.muted, marginTop: 6, marginBottom: 24 },
  startBtn: {
    backgroundColor: COLORS.shieldBlue, borderRadius: RADIUS.lg,
    paddingVertical: 14, paddingHorizontal: 52,
  },
  startBtnText: { color: 'white', fontSize: 16, fontWeight: FONTS.bold },
  scanningContainer: { alignItems: 'center', paddingVertical: 32 },
  scanningIcon: { fontSize: 64 },
  scanningTitle: { fontSize: 18, fontWeight: FONTS.bold, color: COLORS.softNavy, marginTop: 16 },
  scanningStage: { fontSize: 13, color: COLORS.muted, marginTop: 6 },
  progressBar: {
    width: '100%', height: 8, backgroundColor: '#E8EDF5',
    borderRadius: 4, marginTop: 20, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.shieldBlue, borderRadius: 4 },
  progressPct: { fontSize: 14, color: COLORS.shieldBlue, fontWeight: FONTS.bold, marginTop: 8 },
  resultsContainer: { gap: SPACING.md },
  summaryCard: {
    backgroundColor: COLORS.softNavy, borderRadius: RADIUS.xl,
    padding: SPACING.lg, alignItems: 'center',
  },
  summaryLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  summaryTitle: { color: 'white', fontSize: 26, fontWeight: FONTS.black, marginTop: 4 },
  summaryRow: { flexDirection: 'row', gap: 32, marginTop: 16 },
  summaryItem: { alignItems: 'center' },
  summaryNum: { fontSize: 24, fontWeight: FONTS.black },
  summaryItemLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.softNavy },
  appCard: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.lg,
    padding: SPACING.md, flexDirection: 'row', alignItems: 'center',
    gap: SPACING.sm, borderLeftWidth: 4, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  appIcon: { fontSize: 26 },
  appInfo: { flex: 1 },
  appName: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.softNavy },
  appPackage: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  badge: { borderRadius: RADIUS.sm, paddingVertical: 3, paddingHorizontal: 8 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: FONTS.black },
  expandedCard: {
    backgroundColor: '#F8FAFF', borderRadius: RADIUS.md,
    padding: SPACING.md, marginBottom: 10, marginTop: -6,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  expandedLabel: { fontSize: 12, fontWeight: FONTS.bold, color: COLORS.muted, marginBottom: 4 },
  expandedReason: { fontSize: 13, color: '#444', marginBottom: 12 },
  permissionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  permChip: {
    backgroundColor: COLORS.lightBg, borderRadius: RADIUS.sm,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  permChipText: { color: COLORS.shieldBlue, fontSize: 11, fontWeight: FONTS.semibold },
  removeBtn: {
    backgroundColor: COLORS.dangerRed, borderRadius: RADIUS.md,
    padding: 12, alignItems: 'center',
  },
  removeBtnText: { color: 'white', fontSize: 13, fontWeight: FONTS.bold },
  rescanBtn: {
    backgroundColor: 'transparent', borderRadius: RADIUS.lg,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.shieldBlue,
  },
  rescanBtnText: { color: COLORS.shieldBlue, fontSize: 15, fontWeight: FONTS.bold },
});
