import ScanService from '../ScanService';

// jest.mock calls are hoisted above imports by babel-plugin-jest-hoist, so
// source order here doesn't affect behavior — only lint's import/first rule.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('axios', () => ({
  get: jest.fn(() => Promise.resolve({ data: { threats: [] } })),
}));

// The real native module can only be resolved inside an actual native
// runtime. These tests run on the default jest-expo (iOS) platform, where
// ScanService never calls it anyway (see Platform.OS checks), so a stub
// is enough to let the module load.
jest.mock('../../../modules/buddyshield-native/src/BuddyshieldNativeModule', () => ({
  getInstalledApps: jest.fn(() => Promise.resolve([])),
  hasUsageAccess: jest.fn(() => false),
  openUsageAccessSettings: jest.fn(),
  getUsageStats: jest.fn(() => Promise.resolve([])),
  getPermissionAccessLog: jest.fn(() => ({ supported: false, reason: '', events: [] })),
}));

beforeEach(() => {
  // Skip the artificial per-stage delay so runFullScan tests stay fast.
  ScanService._delay = jest.fn(() => Promise.resolve());
});

describe('_scanPermissions', () => {
  it('flags a permission from the risk matrix at its matrix risk level', async () => {
    // ACCESS_FINE_LOCATION isn't in TOOLS's "never" list, so this only
    // exercises the permission-matrix path, not the category escalation.
    const apps = [{ packageName: 'com.test', category: 'TOOLS', permissions: ['ACCESS_FINE_LOCATION'] }];
    const [result] = await ScanService._scanPermissions(apps);
    expect(result.riskFromPermissions).toBe('high');
    expect(result.permissionFlags).toEqual([{ permission: 'ACCESS_FINE_LOCATION', riskLevel: 'high' }]);
  });

  it('escalates to critical when a category "never" permission is present', async () => {
    const apps = [{ packageName: 'com.test', category: 'PRODUCTIVITY', permissions: ['RECORD_AUDIO'] }];
    const [result] = await ScanService._scanPermissions(apps);
    expect(result.riskFromPermissions).toBe('critical');
  });

  it('rates an app with only a medium-risk permission as medium, not safe', async () => {
    const apps = [{ packageName: 'com.test', category: 'TOOLS', permissions: ['ACCESS_WIFI_STATE'] }];
    const [result] = await ScanService._scanPermissions(apps);
    expect(result.riskFromPermissions).toBe('medium');
  });

  it('leaves an app with no risky permissions as safe', async () => {
    const apps = [{ packageName: 'com.test', category: 'TOOLS', permissions: [] }];
    const [result] = await ScanService._scanPermissions(apps);
    expect(result.riskFromPermissions).toBe('safe');
  });
});

describe('_detectImpersonators', () => {
  it('flags an unverified app that claims to be system software', async () => {
    const apps = [{ packageName: 'com.fake.settings', name: 'System Settings Manager', isSystemApp: false }];
    const [result] = await ScanService._detectImpersonators(apps);
    expect(result.isImpersonator).toBe(true);
    expect(result.risk).toBe('critical');
  });

  it('does not flag a genuine system app', async () => {
    const apps = [{ packageName: 'com.android.settings', name: 'Settings', isSystemApp: true }];
    const [result] = await ScanService._detectImpersonators(apps);
    expect(result.isImpersonator).toBe(false);
  });

  it('does not flag an unrelated app with an unrelated name', async () => {
    const apps = [{ packageName: 'com.weather.now', name: 'Weather Now', isSystemApp: false }];
    const [result] = await ScanService._detectImpersonators(apps);
    expect(result.isImpersonator).toBe(false);
  });
});

describe('_buildFinalReport', () => {
  it('a known threat always wins, even over a safe permission rating', async () => {
    const apps = [{ packageName: 'com.threat', riskFromPermissions: 'safe', knownThreat: true }];
    const [result] = await ScanService._buildFinalReport(apps);
    expect(result.risk).toBe('critical');
  });

  it('an impersonator always escalates to critical', async () => {
    const apps = [{ packageName: 'com.fake', riskFromPermissions: 'safe', isImpersonator: true }];
    const [result] = await ScanService._buildFinalReport(apps);
    expect(result.risk).toBe('critical');
  });

  it('falls back to "No issues found." when nothing is flagged', async () => {
    const apps = [{ packageName: 'com.safe', riskFromPermissions: 'safe' }];
    const [result] = await ScanService._buildFinalReport(apps);
    expect(result.reason).toBe('No issues found.');
  });
});

describe('runFullScan', () => {
  it('returns a fully-processed report for every mock app', async () => {
    const results = await ScanService.runFullScan();
    expect(results.length).toBeGreaterThan(0);
    results.forEach(app => {
      expect(app).toHaveProperty('risk');
      expect(app).toHaveProperty('reason');
      expect(app).toHaveProperty('scannedAt');
    });
  });

  it('reports progress through each of the 7 scan stages', async () => {
    const progressUpdates = [];
    await ScanService.runFullScan((pct, label) => progressUpdates.push({ pct, label }));
    expect(progressUpdates).toHaveLength(7);
    expect(progressUpdates[progressUpdates.length - 1].pct).toBe(100);
  });
});
