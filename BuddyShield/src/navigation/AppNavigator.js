// src/navigation/AppNavigator.js
// Main navigation structure — bottom tabs + stack navigators

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS, FONTS } from '../constants/theme';

// Screens
import HomeScreen from '../screens/HomeScreen';
import ScanScreen from '../screens/ScanScreen';
import MonitorScreen from '../screens/MonitorScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AppDetailScreen from '../screens/AppDetailScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ProUpgradeScreen from '../screens/ProUpgradeScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Tab Icon Component ───────────────────────────────────────────────────
function TabIcon({ emoji, label, focused }) {
  return (
    <View style={styles.tabItem}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
        {label}
      </Text>
      {focused && <View style={styles.tabIndicator} />}
    </View>
  );
}

// ─── Main Tab Navigator ───────────────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🛡️" label="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🔍" label="Scan" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Monitor"
        component={MonitorScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📡" label="Monitor" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="⚙️" label="Settings" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Stack Navigator ─────────────────────────────────────────────────
export default function AppNavigator({ isFirstLaunch }) {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isFirstLaunch ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : null}
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen
          name="AppDetail"
          component={AppDetailScreen}
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="ProUpgrade"
          component={ProUpgradeScreen}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.cardWhite,
    borderTopColor: '#E8EDF5',
    borderTopWidth: 1,
    height: 70,
    paddingBottom: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabEmoji: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: FONTS.semibold,
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: COLORS.shieldBlue,
  },
  tabIndicator: {
    width: 20,
    height: 3,
    backgroundColor: COLORS.shieldBlue,
    borderRadius: 2,
    marginTop: 2,
  },
});
