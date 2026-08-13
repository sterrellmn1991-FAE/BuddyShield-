// src/screens/OnboardingScreen.js
// First-launch welcome screen — sets expectations before the first scan

import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme';

const STEPS = [
  { icon: '🛡️', title: 'Someone’s always got your back', desc: 'BuddyShield scans your device for hidden spyware, stalkerware, and apps that overreach.' },
  { icon: '🔍', title: 'One tap, full scan', desc: 'We check every installed app’s permissions, behavior, and reputation against a threat database.' },
  { icon: '🔒', title: 'Nothing leaves your phone without you knowing', desc: 'Plain-language results, no jargon — just tell you what’s wrong and how to fix it.' },
];

export default function OnboardingScreen() {
  const navigation = useNavigation();

  const finish = () => navigation.replace('Main');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        {STEPS.map(step => (
          <View key={step.title} style={styles.step}>
            <Text style={styles.icon}>{step.icon}</Text>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.desc}>{step.desc}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.cta} onPress={finish}>
        <Text style={styles.ctaText}>Get Started</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.softNavy, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: SPACING.xxl },
  step: { alignItems: 'center', gap: SPACING.sm },
  icon: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: FONTS.black, color: 'white', textAlign: 'center' },
  desc: { fontSize: 14, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 20 },
  cta: {
    backgroundColor: COLORS.shieldBlue, borderRadius: RADIUS.lg,
    paddingVertical: 16, alignItems: 'center',
    marginHorizontal: SPACING.xl, marginBottom: SPACING.xl,
  },
  ctaText: { color: 'white', fontSize: 16, fontWeight: FONTS.black },
});
