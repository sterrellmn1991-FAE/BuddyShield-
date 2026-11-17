// src/screens/AppDetailScreen.js
// Modal detail view for a single scanned app — opened from Home/Scan results

import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS, RISK_LEVELS } from '../constants/theme';
import AppIcon from '../components/AppIcon';

export default function AppDetailScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const app = params?.app;

  if (!app) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.desc}>App details unavailable.</Text>
      </SafeAreaView>
    );
  }

  const risk = RISK_LEVELS[app.risk] || RISK_LEVELS.safe;

  const openPlayStoreListing = () => {
    Linking.openURL(`market://details?id=${app.packageName}`).catch(() =>
      Linking.openURL(`https://play.google.com/store/apps/details?id=${app.packageName}`)
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <AppIcon icon={app.icon} size={56} style={styles.appIcon} />
          <Text style={styles.appName}>{app.name}</Text>
          <Text style={styles.appPackage}>{app.packageName}</Text>
          <View style={[styles.riskBadge, { backgroundColor: risk.color }]}>
            <Text style={styles.riskLabel}>{risk.label}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>What we found</Text>
          <Text style={styles.cardBody}>{app.reason || 'No issues found.'}</Text>
        </View>

        {app.knownThreat && app.threatDetails && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Threat database match</Text>
            <Text style={styles.cardBody}>{app.threatDetails.description}</Text>
            <Text style={styles.cardMeta}>Source: {app.threatDetails.source}</Text>
          </View>
        )}

        {app.permissionFlags?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Flagged permissions</Text>
            <View style={styles.permissionRow}>
              {app.permissionFlags.map(f => (
                <View key={f.permission} style={styles.permChip}>
                  <Text style={styles.permChipText}>{f.permission}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {app.networkFlag && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Network activity</Text>
            <Text style={styles.cardBody}>{app.networkReason}</Text>
          </View>
        )}

        {app.behaviorFlag && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Background behavior</Text>
            <Text style={styles.cardBody}>{app.behaviorReason}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.linkBtn} onPress={openPlayStoreListing}>
          <Text style={styles.linkBtnText}>View on Play Store</Text>
        </TouchableOpacity>

        {app.risk !== 'safe' && (
          <TouchableOpacity style={styles.removeBtn}>
            <Text style={styles.removeBtnText}>Uninstall This App</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.lightBg },
  scroll: { padding: SPACING.md, gap: SPACING.md, paddingBottom: 40 },
  closeBtn: { alignSelf: 'flex-end', padding: 8 },
  closeText: { fontSize: 18, color: COLORS.muted },
  header: { alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  appIcon: { fontSize: 56 },
  appName: { fontSize: 20, fontWeight: FONTS.black, color: COLORS.softNavy, textAlign: 'center' },
  appPackage: { fontSize: 12, color: COLORS.muted },
  riskBadge: { borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 12, marginTop: 4 },
  riskLabel: { color: 'white', fontSize: 11, fontWeight: FONTS.black },
  card: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.lg,
    padding: SPACING.md, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardLabel: { fontSize: 12, fontWeight: FONTS.bold, color: COLORS.muted },
  cardBody: { fontSize: 14, color: '#333', lineHeight: 20 },
  cardMeta: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  permissionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  permChip: {
    backgroundColor: COLORS.lightBg, borderRadius: RADIUS.sm,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  permChipText: { color: COLORS.shieldBlue, fontSize: 11, fontWeight: FONTS.semibold },
  linkBtn: {
    borderRadius: RADIUS.lg, paddingVertical: 14, alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.shieldBlue,
  },
  linkBtnText: { color: COLORS.shieldBlue, fontSize: 15, fontWeight: FONTS.bold },
  removeBtn: {
    backgroundColor: COLORS.dangerRed, borderRadius: RADIUS.lg,
    paddingVertical: 14, alignItems: 'center',
  },
  removeBtnText: { color: 'white', fontSize: 15, fontWeight: FONTS.bold },
});
