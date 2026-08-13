import useStore from '../useStore';

const DEFAULT_SETTINGS = {
  autoScanEnabled: true,
  realTimeAlerts: true,
  covertMode: false,
  privacyMode: false,
  scanFrequencyHours: 24,
};

beforeEach(() => {
  useStore.setState({
    scanResults: [],
    shieldScore: null,
    activityLog: [],
    settings: { ...DEFAULT_SETTINGS },
  });
});

describe('calculateScore', () => {
  it('returns 100 when there are no scan results', () => {
    expect(useStore.getState().calculateScore()).toBe(100);
  });

  it('deducts points per risk level', () => {
    useStore.setState({
      scanResults: [{ risk: 'critical' }, { risk: 'high' }, { risk: 'medium' }, { risk: 'safe' }],
    });
    // 100 - 25 (critical) - 15 (high) - 8 (medium) - 0 (safe) = 52
    expect(useStore.getState().calculateScore()).toBe(52);
  });

  it('clamps the score at 0 instead of going negative', () => {
    useStore.setState({
      scanResults: Array(5).fill({ risk: 'critical' }),
    });
    expect(useStore.getState().calculateScore()).toBe(0);
  });

  it('also writes the result to shieldScore', () => {
    useStore.setState({ scanResults: [{ risk: 'high' }] });
    const score = useStore.getState().calculateScore();
    expect(useStore.getState().shieldScore).toBe(score);
  });
});

describe('updateSetting', () => {
  it('merges the new value without clobbering other settings', () => {
    useStore.getState().updateSetting('covertMode', true);
    const { settings } = useStore.getState();
    expect(settings.covertMode).toBe(true);
    expect(settings.autoScanEnabled).toBe(true);
  });
});

describe('addActivityEvent', () => {
  it('prepends new events, most recent first', () => {
    useStore.getState().addActivityEvent({ id: 1 });
    useStore.getState().addActivityEvent({ id: 2 });
    expect(useStore.getState().activityLog.map(e => e.id)).toEqual([2, 1]);
  });

  it('caps the log at 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      useStore.getState().addActivityEvent({ id: i });
    }
    const { activityLog } = useStore.getState();
    expect(activityLog).toHaveLength(100);
    expect(activityLog[0].id).toBe(104);
  });
});
