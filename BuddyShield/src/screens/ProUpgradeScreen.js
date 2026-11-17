// src/screens/ProUpgradeScreen.js

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme';
import useStore from '../store/useStore';

const FEATURES = [
  { icon: '📡', label: 'Real-Time Monitoring', desc: 'Get alerted the moment something suspicious happens' },
  { icon: '🎙️', label: 'Mic & Camera Guard', desc: 'Live alerts when any app accesses your mic or camera' },
  { icon: '🌐', label: 'Network Traffic Analyzer', desc: 'See exactly where your data is being sent' },
  { icon: '👻', label: 'Covert Mode', desc: 'Hide BuddyShield completely from your home screen' },
  { icon: '📊', label: 'Weekly Privacy Reports', desc: 'Email summary of your device health every week' },
  { icon: '👨‍👩‍👧‍👦', label: 'Family Plan', desc: 'Protect up to 5 devices under one subscription' },
];

export default function ProUpgradeScreen() {
  const navigation = useNavigation();
  const { setIsPro } = useStore();
  const [selected, setSelected] = useState('yearly');

  const handlePurchase = () => {
    // Production: call react-native-iap purchase flow here
    // then verify receipt with backend at /billing/verify
    // On success:
    setIsPro(true);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Close */}
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>⭐</Text>
          <Text style={styles.heroTitle}>BuddyShield Pro</Text>
          <Text style={styles.heroSubtitle}>
            Full protection. Real-time alerts. Someone&apos;s always watching your back.
          </Text>
        </View>

        {/* Feature List */}
        <View style={styles.featureList}>
          {FEATURES.map(f => (
            <View key={f.label} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <View style={styles.featureInfo}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
              <Text style={styles.checkmark}>✓</Text>
            </View>
          ))}
        </View>

        {/* Pricing Options */}
        <Text style={styles.pricingTitle}>Choose your plan</Text>
        <View style={styles.pricingRow}>
          <TouchableOpacity
            style={[styles.planCard, selected === 'monthly' && styles.planCardSelected]}
            onPress={() => setSelected('monthly')}
          >
            <Text style={styles.planName}>Monthly</Text>
            <Text style={styles.planPrice}>$2.99</Text>
            <Text style={styles.planPer}>per month</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planCard, selected === 'yearly' && styles.planCardSelected]}
            onPress={() => setSelected('yearly')}
          >
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>BEST VALUE</Text>
            </View>
            <Text style={styles.planName}>Yearly</Text>
            <Text style={styles.planPrice}>$19.99</Text>
            <Text style={styles.planPer}>per year · save 44%</Text>
          </TouchableOpacity>
        </View>

        {/* CTA */}
        <TouchableOpacity style={styles.ctaBtn} onPress={handlePurchase}>
          <Text style={styles.ctaBtnText}>
            Start Pro — {selected === 'monthly' ? '$2.99/mo' : '$19.99/yr'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.fine}>
          Cancel anytime. Managed via Google Play subscriptions. No hidden fees.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.lightBg },
  scroll: { padding: SPACING.md, gap: SPACING.lg, paddingBottom: 40 },
  closeBtn: { alignSelf: 'flex-end', padding: 8 },
  closeText: { fontSize: 18, color: COLORS.muted },
  hero: { alignItems: 'center', gap: 8 },
  heroIcon: { fontSize: 56 },
  heroTitle: { fontSize: 28, fontWeight: FONTS.black, color: COLORS.softNavy },
  heroSubtitle: { fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 20 },
  featureList: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.xl,
    padding: SPACING.md, gap: SPACING.md,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  featureIcon: { fontSize: 24, width: 32 },
  featureInfo: { flex: 1 },
  featureLabel: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.softNavy },
  featureDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  checkmark: { fontSize: 16, color: COLORS.successGreen, fontWeight: FONTS.bold },
  pricingTitle: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.softNavy },
  pricingRow: { flexDirection: 'row', gap: 12 },
  planCard: {
    flex: 1, backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.xl,
    padding: SPACING.md, alignItems: 'center', gap: 4,
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  planCardSelected: {
    borderColor: COLORS.shieldBlue,
    backgroundColor: '#F0F4FF',
  },
  planName: { fontSize: 13, fontWeight: FONTS.bold, color: COLORS.muted },
  planPrice: { fontSize: 28, fontWeight: FONTS.black, color: COLORS.softNavy },
  planPer: { fontSize: 11, color: COLORS.muted, textAlign: 'center' },
  bestValueBadge: {
    backgroundColor: COLORS.successGreen, borderRadius: 6,
    paddingVertical: 3, paddingHorizontal: 8, marginBottom: 4,
  },
  bestValueText: { color: 'white', fontSize: 9, fontWeight: FONTS.black },
  ctaBtn: {
    backgroundColor: COLORS.shieldBlue, borderRadius: RADIUS.lg,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: COLORS.shieldBlue, shadowOpacity: 0.4, shadowRadius: 12, elevation: 4,
  },
  ctaBtnText: { color: 'white', fontSize: 16, fontWeight: FONTS.black },
  fine: { textAlign: 'center', fontSize: 11, color: COLORS.muted },
});
