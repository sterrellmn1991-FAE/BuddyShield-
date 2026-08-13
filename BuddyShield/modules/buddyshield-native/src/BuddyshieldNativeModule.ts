import { NativeModule, requireNativeModule } from 'expo';

import type { InstalledApp, PermissionAccessLog, UsageStatEntry } from './BuddyshieldNative.types';

declare class BuddyshieldNativeModule extends NativeModule<Record<string, never>> {
  getInstalledApps(): Promise<InstalledApp[]>;
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  getUsageStats(days: number): Promise<UsageStatEntry[]>;
  getPermissionAccessLog(): PermissionAccessLog;
}

export default requireNativeModule<BuddyshieldNativeModule>('BuddyshieldNative');
