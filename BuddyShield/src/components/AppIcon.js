// src/components/AppIcon.js
// Renders either a real app icon (data URI from the native scan) or an
// emoji fallback (used by mock/threat-database entries).

import React from 'react';
import { Image, Text } from 'react-native';

export default function AppIcon({ icon, size = 28, style }) {
  if (typeof icon === 'string' && icon.startsWith('data:image')) {
    return (
      <Image
        source={{ uri: icon }}
        style={[{ width: size, height: size, borderRadius: size * 0.22 }, style]}
      />
    );
  }
  return <Text style={[{ fontSize: size }, style]}>{icon || '📦'}</Text>;
}
