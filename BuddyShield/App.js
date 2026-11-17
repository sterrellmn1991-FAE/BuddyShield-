// App.js
// BuddyShield — Root Entry Point

import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator from './src/navigation/AppNavigator';
import ThreatDatabaseService from './src/services/ThreatDatabaseService';

const FIRST_LAUNCH_KEY = 'buddyshield_launched';

export default function App() {
  const [isFirstLaunch, setIsFirstLaunch] = useState(null);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      // Check first launch
      const launched = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
      if (!launched) {
        setIsFirstLaunch(true);
        await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
      } else {
        setIsFirstLaunch(false);
      }

      // Pre-load threat database in background
      ThreatDatabaseService.syncFromServer().catch(() => {});

    } catch (_error) {
      setIsFirstLaunch(false);
    }
  };

  // Wait until we know first launch status
  if (isFirstLaunch === null) return null;

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <AppNavigator isFirstLaunch={isFirstLaunch} />
    </>
  );
}
