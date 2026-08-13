# BuddyShield

> **"Someone's always got your back."**
> Android privacy & spyware detection app, built with Expo (SDK 55) + React Native.

This is a real, runnable Expo project — not a UI mockup. It uses a local Expo
native module (`modules/buddyshield-native`) to scan your actual installed
apps and usage stats on Android, with mock data as a fallback on iOS/Expo Go
where that data isn't available.

---

## Project structure

```
BuddyShield/
├── App.js                          # Root entry point
├── index.js                        # Expo entry (registers App)
├── app.json                        # Expo config — package name, permissions, icons
├── eas.json                        # EAS Build/submit profiles
├── modules/buddyshield-native/     # Local native module (Kotlin/Swift)
│   └── android/.../BuddyshieldNativeModule.kt
├── src/
│   ├── constants/                  # theme.js, api.js
│   ├── store/useStore.js           # Global state (Zustand)
│   ├── services/                   # ScanService, ThreatDatabaseService
│   ├── navigation/AppNavigator.js  # Bottom tabs + stack nav
│   ├── screens/                    # Home, Scan, Monitor, Settings, ProUpgrade, etc.
│   └── components/                 # ScoreRing, AppIcon
└── assets/images/                  # App icon, adaptive icon, splash (placeholder branding)
```

---

## Run it

```bash
cd BuddyShield
npm install

# Quick JS-only preview in Expo Go (native scan module won't work here —
# Expo Go can't load custom native code, so the app falls back to mock data):
npx expo start

# Real device/emulator build with the native module included (requires
# Android Studio + SDK on your machine, or use EAS Build below instead):
npx expo run:android
```

The scan screens (`ScanScreen`, `HomeScreen`) automatically detect whether the
native module is available and use real device data on Android when it is,
falling back to mock data otherwise — so the app is always demoable, and
shows real results once run as a native/dev-client build on an actual
Android device.

---

## What the "real scan" can and can't do

This matters for setting expectations — some of what a spyware-detection app
conceptually wants to do isn't something Android allows *any* third-party
Play Store app to do:

| Feature | Status | Why |
|---|---|---|
| List installed apps + their requested permissions | ✅ Real (Android) | `PackageManager.getInstalledPackages()`. Requires the `QUERY_ALL_PACKAGES` permission — Play Console requires a [declaration form](https://support.google.com/googleplay/android-developer/answer/10158779) justifying it (security apps qualify). |
| Real app icons | ✅ Real (Android) | Extracted via `PackageManager.getApplicationIcon()`, sent to JS as base64 PNGs. |
| Usage stats (foreground time) | ✅ Real (Android), opt-in | Requires "Usage access", a special permission the user must grant manually in Settings — the app has a banner + deep link for this (`BuddyshieldNative.openUsageAccessSettings()`). |
| Per-app mic/camera/location access history ("Mic Monitor", "who's listening") | ❌ Not implementable for 3rd-party apps | Android restricts cross-app `AppOps` history to system/signature-level apps (this is what powers the OS's own Privacy Dashboard). No public API exposes this to Play Store apps for *other* apps' sensor access. The native module reports this honestly (`getPermissionAccessLog()` → `supported: false`) instead of faking it. |
| Network traffic analyzer (per-app destinations) | 🔲 Not built yet | This *is* technically possible via a local `VpnService` that routes traffic through the device and attributes it per-app — a legitimate, common technique (e.g., NetGuard, Instagram-blocker apps use it). Not implemented in this pass; `ScanService._checkNetworkActivity()` is still mock-only. |
| Threat database (known stalkerware package names) | ✅ Real, local seed list | Ships with a small seed list (`ThreatDatabaseService.js`). `syncFromServer()` will pull updates once you stand up the backend below. |
| iOS | ❌ Not supported | Apple's sandboxing means no app — this one included — can enumerate other installed apps or their usage data. The native module returns empty/safe stubs on iOS rather than crashing. |

---

## Before you can submit to the Play Store

I built and validated the app itself (it installs, bundles, lints clean, and
the native module autolinks correctly — verified with `expo export` and
`expo prebuild` in this environment, which has no Android SDK/emulator to
actually launch it). The remaining steps need **your own accounts and
credentials** — nothing I can do on your behalf:

1. **Google Play Console account** ($25 one-time fee) — create the app
   listing, upload a privacy policy URL (required — you're requesting
   sensitive permissions), and fill out the Data Safety form.
2. **`QUERY_ALL_PACKAGES` declaration** — Play Console will prompt for this
   automatically once it sees the permission in your manifest. Justify it as
   "security app scanning installed apps for known threats."
3. **App icon / screenshots** — `assets/images/icon.png` etc. are placeholder
   branding I generated (a navy/blue shield glyph). Replace with real design
   assets before shipping; Play Store also requires 1080×1920 screenshots.
4. **EAS account + build**:
   ```bash
   npm install -g eas-cli
   eas login
   eas init          # links this project to your Expo/EAS account, fills app.json's extra.eas.projectId
   eas build --platform android --profile production
   eas submit --platform android --profile production
   ```
   EAS Build compiles the native Android project in the cloud — you don't
   need Android Studio locally for this path.
5. **Signing** — EAS manages your upload keystore for you on first build
   (or you can provide your own). Play App Signing handles the rest.

### Not yet wired up (flagged in the original project roadmap too)

- **Billing** (`react-native-iap`) — `ProUpgradeScreen`'s purchase button is
  still a local-state mock (`setIsPro(true)`); wiring real Play Billing
  requires configuring subscription products in Play Console first.
- **Push notifications** (Firebase) — needs your own Firebase project +
  `google-services.json`.
- **Backend** — `ThreatDatabaseService`/`ScanService` call
  `API_BASE_URL` (see `src/constants/api.js`) for sync/scan history; no
  server exists yet. The app works fully offline against the local seed
  threat database without one.

None of these block getting a working app onto the Play Store's internal
testing track — they're what the original project README already listed as
"Pending" roadmap items.

---

## Native module reference

`modules/buddyshield-native` exposes, on Android:

```js
import BuddyshieldNative from './modules/buddyshield-native/src/BuddyshieldNativeModule';

await BuddyshieldNative.getInstalledApps();      // -> InstalledApp[]
BuddyshieldNative.hasUsageAccess();              // -> boolean
BuddyshieldNative.openUsageAccessSettings();      // opens the Settings screen
await BuddyshieldNative.getUsageStats(30);        // -> UsageStatEntry[] (last N days)
BuddyshieldNative.getPermissionAccessLog();       // -> { supported: false, ... }
```

See `modules/buddyshield-native/src/BuddyshieldNative.types.ts` for shapes.

---

*BuddyShield · Built for Android · Targeting Google Play Store*
