import { describe, it, expect } from 'vitest';
import {
  DEVICE_STATE, deriveDeviceState, detectPushCapability,
} from '@/lib/notificationDeviceState';

// The device switch must follow the REAL push subscription, not a local
// permission snapshot: on iOS a reinstalled Home Screen app can still report
// "default" after the user granted push, and OneSignal's `subscribed` flag only
// turns true once the Apple token registers. Requiring either one disabled the
// switch or left it stuck OFF after a successful grant.

const base = { configured: true, supported: true, ready: true, permission: 'granted' };

describe('deriveDeviceState', () => {
  it('is ON when the subscription is opted in', () => {
    const state = deriveDeviceState({ ...base, optedIn: true, subscribed: true });
    expect(state.status).toBe(DEVICE_STATE.ON);
    expect(state.on).toBe(true);
    expect(state.canToggle).toBe(true);
  });

  it('is ON while the Apple token is still registering (opted in, not yet subscribed)', () => {
    const state = deriveDeviceState({ ...base, optedIn: true, subscribed: false });
    expect(state.status).toBe(DEVICE_STATE.ON);
    expect(state.on).toBe(true);
  });

  it('is ON when the browser snapshot is stale but the subscription is opted in', () => {
    const state = deriveDeviceState({ ...base, permission: 'default', optedIn: true, subscribed: false });
    expect(state.on).toBe(true);
  });

  it('stays OFF after a refresh when the user opted out', () => {
    const state = deriveDeviceState({ ...base, optedIn: false, subscribed: false });
    expect(state.status).toBe(DEVICE_STATE.OFF);
    expect(state.on).toBe(false);
    expect(state.canToggle).toBe(true);
  });

  it('follows an explicit opt-out over a stale subscribed flag', () => {
    const state = deriveDeviceState({ ...base, optedIn: false, subscribed: true });
    expect(state.on).toBe(false);
  });

  it('falls back to subscribed while optedIn is still unknown', () => {
    expect(deriveDeviceState({ ...base, optedIn: null, subscribed: true }).on).toBe(true);
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

  it('reports loading until the SDK answers, never a premature OFF', () => {
    const state = deriveDeviceState({ ...base, ready: false, permission: 'default', optedIn: null });
    expect(state.status).toBe(DEVICE_STATE.LOADING);
    expect(state.canToggle).toBe(false);
  });

  it('is always toggleable once ready and not blocked', () => {
    expect(deriveDeviceState({ ...base, optedIn: null }).canToggle).toBe(true);
    expect(deriveDeviceState({ ...base, permission: 'default', optedIn: false }).canToggle).toBe(true);
  });

  it('reports unconfigured and unsupported without a usable control', () => {
    expect(deriveDeviceState({ configured: false }).status).toBe(DEVICE_STATE.UNCONFIGURED);
    expect(deriveDeviceState({ ...base, supported: false }).canToggle).toBe(false);
    expect(deriveDeviceState({ ...base, supported: false }).status).toBe(DEVICE_STATE.UNSUPPORTED);
  });

  it('keeps the iOS install-required state distinct from plain unsupported', () => {
    const state = deriveDeviceState({
      ...base, supported: false, capabilityStatus: DEVICE_STATE.NEEDS_INSTALL,
    });
    expect(state.status).toBe(DEVICE_STATE.NEEDS_INSTALL);
    expect(state.canToggle).toBe(false);
  });
});

describe('detectPushCapability', () => {
  it('supports a desktop browser with Notification and a service worker', () => {
    expect(detectPushCapability({ hasNotification: true, hasServiceWorker: true }).supported).toBe(true);
  });

  it('supports an iOS app opened from the Home screen', () => {
    const cap = detectPushCapability({
      hasNotification: true, hasServiceWorker: true, ios: true, standalone: true,
    });
    expect(cap.supported).toBe(true);
    expect(cap.status).toBe(null);
  });

  it('asks an iOS Safari tab to install the app first', () => {
    const cap = detectPushCapability({
      hasNotification: true, hasServiceWorker: true, ios: true, standalone: false,
    });
    expect(cap.supported).toBe(false);
    expect(cap.status).toBe(DEVICE_STATE.NEEDS_INSTALL);
  });

  it('reports unsupported when the push APIs are missing (iOS before 16.4)', () => {
    const cap = detectPushCapability({ hasNotification: false, hasServiceWorker: true, ios: true, standalone: true });
    expect(cap.supported).toBe(false);
    expect(cap.status).toBe(DEVICE_STATE.UNSUPPORTED);
  });
});