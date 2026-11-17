// src/screens/HomeScreen.js

import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS, RISK_LEVELS } from '../constants/theme';
import useStore from '../store/useStore';
import ScoreRing from '../components/ScoreRing';
import AppIcon from '../components/AppIcon';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { shieldScore, scanResults, lastScanDate } = useStore();

  const threats = scanResults.filter(a => a.risk === 'critical' || a.risk === 'high');
  const score = shieldScore ?? 100;

  const scoreMessage = () => {
    if (score >= 80) return "Your phone looks clean 👍";
    if (score >= 50) return "A few things need attention";
    return "Threats detected — act now";
  };

  const formatLastScan = () => {
    if (!lastScanDate) return 'Not scanned yet';
    const diff = Math.floor((Date.now() - new Date(lastScanDate)) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} minute${diff > 1 ? 's' : ''} ago`;
    const hrs = Math.floor(diff / 60);
    return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  };

  const quickActions = [
    { icon: '🎙️', label: 'Mic Monitor', desc: "Who's listening?" },
    { icon: '📍', label: 'Location Check', desc: "Who's tracking you?" },
    { icon: '💬', label: 'SMS Guard', desc: 'Protect your texts' },
    { icon: '🚨', label: 'Privacy Mode', desc: 'Lock it all down' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.cardWhite} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>BuddyShield</Text>
            <Text style={styles.tagline}>Someone&apos;s always got your back.</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 20 }}>👤</Text>
          </View>
        </View>

        {/* Score Card */}
        <View style={styles.scoreCard}>
          <ScoreRing score={score} />
          <Text style={styles.scoreMessage}>{scoreMessage()}</Text>
          <Text style={styles.lastScan}>Last scan: {formatLastScan()}</Text>
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => navigation.navigate('Scan')}
          >
            <Text style={styles.scanBtnText}>Run Full Scan</Text>
          </TouchableOpacity>
        </View>

        {/* Threats */}
        {threats.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚠️ Needs Attention ({threats.length})</Text>
            {threats.map(app => (
              <TouchableOpacity
                key={app.packageName}
                style={[styles.threatCard, { borderLeftColor: RISK_LEVELS[app.risk].color }]}
                onPress={() => navigation.navigate('AppDetail', { app })}
              >
                <AppIcon icon={app.icon} size={28} style={styles.appIcon} />
                <View style={styles.threatInfo}>
                  <Text style={styles.appName2}>{app.name}</Text>
                  <Text style={styles.threatReason} numberOfLines={2}>{app.reason}</Text>
                </View>
                <View style={[styles.riskBadge, { backgroundColor: RISK_LEVELS[app.risk].color }]}>
                  <Text style={styles.riskLabel}>{RISK_LEVELS[app.risk].label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            {quickActions.map(q => (
              <TouchableOpacity key={q.label} style={styles.actionCard}>
                <Text style={styles.actionIcon}>{q.icon}</Text>
                <Text style={styles.actionLabel}>{q.label}</Text>
                <Text style={styles.actionDesc}>{q.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.lightBg },
  scroll: { padding: SPACING.md, gap: SPACING.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName: { fontSize: 22, fontWeight: FONTS.black, color: COLORS.softNavy },
  tagline: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#E8EDF5', alignItems: 'center', justifyContent: 'center',
  },
  scoreCard: {
    backgroundColor: COLORS.softNavy, borderRadius: RADIUS.xl,
    padding: SPACING.lg, alignItems: 'center',
  },
  scoreMessage: { color: 'white', fontSize: 15, fontWeight: FONTS.semibold, marginTop: SPACING.md },
  lastScan: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  scanBtn: {
    backgroundColor: COLORS.shieldBlue, borderRadius: RADIUS.md,
    paddingVertical: 13, paddingHorizontal: SPACING.xl,
    marginTop: SPACING.md, width: '100%', alignItems: 'center',
  },
  scanBtnText: { color: 'white', fontSize: 15, fontWeight: FONTS.bold },
  section: { gap: SPACING.sm },
  sectionTitle: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.softNavy },
  threatCard: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.lg,
    padding: SPACING.md, flexDirection: 'row', alignItems: 'center',
    gap: SPACING.sm, borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  appIcon: { fontSize: 28 },
  threatInfo: { flex: 1 },
  appName2: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.softNavy },
  threatReason: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  riskBadge: { borderRadius: RADIUS.sm, paddingVertical: 3, paddingHorizontal: 8 },
  riskLabel: { color: 'white', fontSize: 10, fontWeight: FONTS.black },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.lg,
    padding: SPACING.md, width: '48%',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  actionIcon: { fontSize: 24 },
  actionLabel: { fontSize: 13, fontWeight: FONTS.bold, color: COLORS.softNavy, marginTop: 6 },
  actionDesc: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
});
