// src/screens/SettingsScreen.js

import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme';
import useStore from '../store/useStore';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { settings, updateSetting, isPro } = useStore();

  const toggles = [
    {
      icon: '🔁',
      label: 'Auto Scan Daily',
      desc: 'Scan your device every 24 hours automatically',
      key: 'autoScanEnabled',
      proRequired: false,
    },
    {
      icon: '🔔',
      label: 'Real-Time Alerts',
      desc: 'Notify me when suspicious activity is detected',
      key: 'realTimeAlerts',
      proRequired: true,
    },
    {
      icon: '👻',
      label: 'Covert Mode',
      desc: 'Hide BuddyShield icon from your home screen',
      key: 'covertMode',
      proRequired: true,
    },
  ];

  const links = [
    { label: 'Privacy Policy', icon: '📄' },
    { label: 'How BuddyShield Works', icon: 'ℹ️' },
    { label: 'Contact Support', icon: '💬' },
    { label: 'Rate Us on Play Store', icon: '⭐' },
    { label: 'About BuddyShield', icon: '🛡️' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Customize how BuddyShield protects you.</Text>

        {/* Pro Banner — show if not subscribed */}
        {!isPro && (
          <TouchableOpacity
            style={styles.proBanner}
            onPress={() => navigation.navigate('ProUpgrade')}
            activeOpacity={0.9}
          >
            <View>
              <Text style={styles.proTitle}>⭐ Upgrade to Pro</Text>
              <Text style={styles.proDesc}>
                Real-time monitoring, weekly reports, covert mode & family plan.
              </Text>
            </View>
            <View style={styles.proPriceRow}>
              <TouchableOpacity style={styles.priceBtn}>
                <Text style={styles.priceBtnText}>$2.99/mo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.priceBtnAlt}>
                <Text style={styles.priceBtnAltText}>$19.99/yr</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}

        {/* Pro Active Badge */}
        {isPro && (
          <View style={styles.proActiveBadge}>
            <Text style={styles.proActiveText}>⭐ BuddyShield Pro — Active</Text>
          </View>
        )}

        {/* Toggle Settings */}
        <Text style={styles.sectionTitle}>Preferences</Text>
        {toggles.map(t => {
          const isLocked = t.proRequired && !isPro;
          return (
            <View key={t.key} style={[styles.toggleCard, isLocked && styles.toggleLocked]}>
              <Text style={styles.toggleIcon}>{t.icon}</Text>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleLabelRow}>
                  <Text style={styles.toggleLabel}>{t.label}</Text>
                  {isLocked && (
                    <View style={styles.proBadge}>
                      <Text style={styles.proBadgeText}>PRO</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.toggleDesc}>{t.desc}</Text>
              </View>
              <Switch
                value={!isLocked && settings[t.key]}
                onValueChange={(val) => {
                  if (isLocked) {
                    navigation.navigate('ProUpgrade');
                    return;
                  }
                  updateSetting(t.key, val);
                }}
                trackColor={{ false: '#E0E5EF', true: COLORS.shieldBlue }}
                thumbColor="white"
                disabled={isLocked}
              />
            </View>
          );
        })}

        {/* Links */}
        <Text style={styles.sectionTitle}>More</Text>
        {links.map(link => (
          <TouchableOpacity key={link.label} style={styles.linkCard}>
            <Text style={styles.linkIcon}>{link.icon}</Text>
            <Text style={styles.linkLabel}>{link.label}</Text>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.version}>
          BuddyShield v1.0.0 · Someone&apos;s always got your back.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.lightBg },
  scroll: { padding: SPACING.md, gap: SPACING.md, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: FONTS.black, color: COLORS.softNavy },
  subtitle: { fontSize: 13, color: COLORS.muted },
  proBanner: {
    borderRadius: RADIUS.xl, padding: SPACING.lg, gap: SPACING.md,
    backgroundColor: '#667EEA',
    shadowColor: '#667EEA', shadowOpacity: 0.4, shadowRadius: 12, elevation: 4,
  },
  proTitle: { color: 'white', fontSize: 17, fontWeight: FONTS.black },
  proDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  proPriceRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  priceBtn: {
    backgroundColor: 'white', borderRadius: RADIUS.md,
    paddingVertical: 9, paddingHorizontal: 18,
  },
  priceBtnText: { color: '#667EEA', fontSize: 13, fontWeight: FONTS.black },
  priceBtnAlt: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.md,
    paddingVertical: 9, paddingHorizontal: 18,
  },
  priceBtnAltText: { color: 'white', fontSize: 13, fontWeight: FONTS.bold },
  proActiveBadge: {
    backgroundColor: '#E8F5E9', borderRadius: RADIUS.lg,
    padding: SPACING.md, alignItems: 'center',
  },
  proActiveText: { color: COLORS.successGreen, fontWeight: FONTS.bold, fontSize: 14 },
  sectionTitle: { fontSize: 13, fontWeight: FONTS.bold, color: COLORS.muted, letterSpacing: 0.5 },
  toggleCard: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.lg,
    padding: SPACING.md, flexDirection: 'row',
    alignItems: 'center', gap: SPACING.md,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  toggleLocked: { opacity: 0.6 },
  toggleIcon: { fontSize: 24 },
  toggleInfo: { flex: 1 },
  toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.softNavy },
  toggleDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  proBadge: {
    backgroundColor: '#667EEA', borderRadius: 6,
    paddingVertical: 2, paddingHorizontal: 6,
  },
  proBadgeText: { color: 'white', fontSize: 9, fontWeight: FONTS.black },
  linkCard: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.lg,
    padding: SPACING.md, flexDirection: 'row',
    alignItems: 'center', gap: SPACING.md,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  linkIcon: { fontSize: 20 },
  linkLabel: { flex: 1, fontSize: 14, color: COLORS.softNavy, fontWeight: FONTS.medium },
  linkChevron: { fontSize: 20, color: COLORS.muted },
  version: { textAlign: 'center', color: COLORS.muted, fontSize: 11, marginTop: 8 },
});
