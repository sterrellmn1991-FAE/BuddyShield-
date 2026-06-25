# BuddyShield — React Native Project

> **"Someone's always got your back."**
> Android privacy & spyware detection app for Google Play Store.

---

## Project Structure

```
BuddyShield/
├── App.js                          # Root entry point
├── package.json                    # Dependencies
├── src/
│   ├── constants/
│   │   ├── theme.js                # Colors, fonts, spacing, risk matrix
│   │   └── api.js                  # All API endpoints
│   ├── store/
│   │   └── useStore.js             # Global state (Zustand)
│   ├── services/
│   │   ├── ScanService.js          # Core scan engine
│   │   └── ThreatDatabaseService.js # Local DB + server sync
│   ├── navigation/
│   │   └── AppNavigator.js         # Bottom tabs + stack nav
│   ├── screens/
│   │   ├── HomeScreen.js           # Dashboard + score
│   │   ├── ScanScreen.js           # Full device scan
│   │   ├── MonitorScreen.js        # Live activity feed
│   │   ├── SettingsScreen.js       # Preferences + pro toggle
│   │   └── ProUpgradeScreen.js     # Subscription purchase
│   └── components/
│       └── ScoreRing.js            # Animated SVG score ring
└── docs/
    └── README.md                   # This file
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- Android Studio with Android SDK
- Java 17
- React Native CLI

```bash
# 1. Install dependencies
npm install

# 2. Install Android pods
cd android && ./gradlew clean && cd ..

# 3. Start Metro bundler
npx react-native start

# 4. Run on Android device or emulator
npx react-native run-android
```

---

## Environment Setup

Create a `.env` file in the root:

```
API_BASE_URL=https://api.buddyshield.app/api/v1
FIREBASE_PROJECT_ID=buddyshield-prod
GOOGLE_PLAY_LICENSE_KEY=your_key_here
```

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `react-native-device-info` | Device metadata, installed app info |
| `react-native-background-fetch` | Background scan every 24hrs |
| `@react-native-firebase/messaging` | Push notifications via FCM |
| `react-native-iap` | Google Play subscription billing |
| `react-native-svg` | ScoreRing animated component |
| `react-native-permissions` | Runtime permission requests |
| `zustand` | Lightweight global state |
| `axios` | API requests to backend |

---

## Native Android Module (Required)

Several features require a custom Kotlin native module.
Create `android/app/src/main/java/com/buddyshield/BuddyShieldModule.kt`:

### Methods to implement:
```kotlin
// Returns list of all installed apps with permissions
fun getInstalledApps(): WritableArray

// Returns AppOps usage data (mic, camera, location access log)
fun getPermissionAccessLog(days: Int): WritableArray

// Returns UsageStats for background activity analysis
fun getUsageStats(days: Int): WritableArray
```

Register in `MainApplication.kt`:
```kotlin
packages.add(BuddyShieldPackage())
```

---

## Architecture Overview

```
User Opens App
      ↓
App.js — checks first launch, pre-syncs threat DB
      ↓
AppNavigator — routes to Main tabs or Onboarding
      ↓
HomeScreen — reads shieldScore + scanResults from Zustand store
      ↓
[User taps Scan]
      ↓
ScanScreen → ScanService.runFullScan()
  ├── _getInstalledApps()       via native module
  ├── _scanPermissions()        vs PERMISSIONS_RISK_MATRIX
  ├── _checkThreatDatabase()    vs local SQLite / AsyncStorage
  ├── _detectImpersonators()    certificate + name checks
  ├── _analyzeBehavior()        UsageStats anomaly detection
  ├── _checkNetworkActivity()   VpnService connection logs
  └── _buildFinalReport()       plain language results
      ↓
Results saved to Zustand store
      ↓
calculateScore() → shieldScore updated
      ↓
HomeScreen re-renders with new score + threat cards
```

---

## Monetization Flow

```
Free User
  └── Manual scan only
  └── Basic permission check
  └── Sees Pro upgrade banner

Pro User ($2.99/mo or $19.99/yr)
  └── Real-time monitoring
  └── Network traffic analyzer
  └── Covert mode
  └── Weekly email reports
  └── Family plan (5 devices)
```

### Billing Implementation
```javascript
// In ProUpgradeScreen.js — replace mock with:
import { requestPurchase, getProducts } from 'react-native-iap';

const products = await getProducts({
  skus: ['buddyshield_monthly', 'buddyshield_yearly']
});

await requestPurchase({ sku: selectedSku });
// Then verify receipt on your backend at POST /billing/verify
```

---

## Backend Requirements

Your Node.js/FastAPI server needs these endpoints:

```
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/threats/database     — returns full threat list
POST /api/v1/threats/report       — crowdsourced threat reports
POST /api/v1/scans/submit         — save scan history
GET  /api/v1/scans/history        — retrieve past scans
POST /api/v1/billing/verify       — verify Play Store receipt
GET  /api/v1/billing/status       — check subscription status
```

---

## Google Play Store Submission Checklist

- [ ] Privacy Policy hosted at public URL
- [ ] Data Safety form completed in Play Console
- [ ] SMS/Call Log permission declaration form submitted
- [ ] VpnService usage justified in listing description
- [ ] Target SDK set to API 34 (Android 14)
- [ ] App signed with Play App Signing
- [ ] All screenshots exported at 1080×1920
- [ ] Short description (80 chars max)
- [ ] Content rating questionnaire complete

---

## Development Roadmap

| Phase | Status |
|---|---|
| UI prototype (JSX) | ✅ Complete |
| React Native project structure | ✅ Complete |
| Native Android module | 🔲 Next |
| Backend API server | 🔲 Next |
| Firebase push notifications | 🔲 Pending |
| Google Play billing integration | 🔲 Pending |
| Samsung Knox integration | 🔲 Pending |
| Beta testing (Play Store internal track) | 🔲 Pending |
| Public launch | 🔲 Pending |

---

*BuddyShield · Built for Android · Targeting Google Play Store*
*© 2024 BuddyShield. All rights reserved.*
