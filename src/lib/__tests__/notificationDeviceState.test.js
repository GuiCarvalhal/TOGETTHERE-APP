import { describe, it, expect } from 'vitest';
import { DEVICE_STATE, deriveDeviceState } from '@/lib/notificationDeviceState';

// The device switch must follow the REAL push subscription, not just the
// browser permission. A granted permission with an opted-out subscription is
// still OFF — that mismatch is what made the toggle come back on after a
// refresh.

const base = { configured: true, supported: true, ready: true, permission: 'granted' };

describe('deriveDeviceState', () => {
  it('is ON only when permission is granted and the subscription is live', () => {
    const state = deriveDeviceState({ ...base, optedIn: true, subscribed: true });
    expect(state.status).toBe(DEVICE_STATE.ON);
    expect(state.on).toBe(true);
    expect(state.canToggle).toBe(true);
  });

  it('stays OFF after a refresh when the user opted out but permission remains granted', () => {
    const state = deriveDeviceState({ ...base, optedIn: false, subscribed: false });
    expect(state.status).toBe(DEVICE_STATE.OFF);
    expect(state.on).toBe(false);
    expect(state.canToggle).toBe(true);
  });

  it('is OFF when the browser subscription was dropped even though opted in', () => {
    const state = deriveDeviceState({ ...base, optedIn: true, subscribed: false });
    expect(state.on).toBe(false);
    expect(state.status).toBe(DEVICE_STATE.OFF);
  });

  it('is OFF when the subscription state is still unknown', () => {
    const state = deriveDeviceState({ ...base, optedIn: null, subscribed: null });
    expect(state.on).toBe(false);
    expect(state.canToggle).toBe(true);
  });

  it('treats a denied permission as blocked and un-toggleable', () => {
    const state = deriveDeviceState({ ...base, permission: 'denied', optedIn: false, subscribed: false });
    expect(state.status).toBe(DEVICE_STATE.BLOCKED);
    expect(state.on).toBe(false);
    expect(state.canToggle).toBe(false);
  });

  it('reports loading until the SDK is ready, never a premature OFF', () => {
    const state = deriveDeviceState({ ...base, ready: false, permission: 'default', optedIn: null });
    expect(state.status).toBe(DEVICE_STATE.LOADING);
    expect(state.canToggle).toBe(false);
  });

  it('reports unconfigured and unsupported without a usable control', () => {
    expect(deriveDeviceState({ configured: false }).status).toBe(DEVICE_STATE.UNCONFIGURED);
    expect(deriveDeviceState({ ...base, supported: false }).canToggle).toBe(false);
    expect(deriveDeviceState({ ...base, supported: false }).status).toBe(DEVICE_STATE.UNSUPPORTED);
  });

  it('never reports ON for a permission that is only default', () => {
    const state = deriveDeviceState({ ...base, permission: 'default', optedIn: true, subscribed: true });
    expect(state.on).toBe(false);
  });
});