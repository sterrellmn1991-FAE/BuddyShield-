export type InstalledApp = {
  name: string;
  packageName: string;
  icon: string | null; // data:image/png;base64,... or null if unavailable
  isSystemApp: boolean;
  permissions: string[];
  installerPackage: string | null;
  firstInstallTime: number;
  lastUpdateTime: number;
  versionName: string | null;
};

export type UsageStatEntry = {
  packageName: string;
  totalTimeInForegroundMs: number;
  lastTimeUsed: number;
};

export type NetworkUsageEntry = {
  packageName: string;
  name: string;
  rxBytes: number;
  txBytes: number;
};

export type PermissionAccessLog = {
  supported: boolean;
  reason: string;
  events: unknown[];
};
