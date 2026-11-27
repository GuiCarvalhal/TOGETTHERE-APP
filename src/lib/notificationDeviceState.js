// Pure derivation of THIS device's push state.
//
// Two things are NOT the device state on their own:
//  • Notification.permission — a stale browser snapshot. On iOS a freshly
//    reinstalled Home Screen app can still report "default" (or a stale
//    "denied") after the user granted push, which disabled the switch.
//  • OneSignal's `subscribed` flag — it only turns true once the Apple push
//    token has registered, which lags well behind the grant on iOS. Requiring it
//    made a granted device read OFF and snap back after every toggle.
// The subscription intent (`optedIn`) is the truth, guarded by a real denial.

export const DEVICE_STATE = {
  UNCONFIGURED: 'unconfigured',
  UNSUPPORTED: 'unsupported',
  NEEDS_INSTALL: 'needs_install',
  BLOCKED: 'blocked',
  LOADING: 'loading',
  ON: 'on',
  OFF: 'off',
};

// Can this environment receive web push at all? On iOS push only exists inside
// an app added to the Home Screen (iOS 16.4+), so a Safari tab there reports the
// APIs but can never subscribe.
export function detectPushCapability({
  hasNotification = false,
  hasServiceWorker = false,
  ios = false,
  standalone = false,
} = {}) {
  if (!hasNotification || !hasServiceWorker) {
    return { supported: false, status: DEVICE_STATE.UNSUPPORTED };
  }
  if (ios && !standalone) {
    return { supported: false, status: DEVICE_STATE.NEEDS_INSTALL };
  }
  return { supported: true, status: null };
}

export function deriveDeviceState({
  configured = false,
  supported = false,
  capabilityStatus = null,
  ready = false,
  permission = 'default',
  optedIn = null,
  subscribed = null,
} = {}) {
  if (!configured) return { status: DEVICE_STATE.UNCONFIGURED, on: false, canToggle: false };
  if (!supported) {
    return { status: capabilityStatus || DEVICE_STATE.UNSUPPORTED, on: false, canToggle: false };
  }
  // Only a real denial locks the control: the browser has to be changed by the
  // user, so the switch is guarded instead of failing silently.
  if (permission === 'denied') return { status: DEVICE_STATE.BLOCKED, on: false, canToggle: false };
  if (!ready) return { status: DEVICE_STATE.LOADING, on: false, canToggle: false };

  // ON follows the subscription intent. `subscribed` alone is accepted only
  // while `optedIn` is still unknown (SDK flags not read yet).
  const on = optedIn === true || (optedIn === null && subscribed === true);
  return {
    status: on ? DEVICE_STATE.ON : DEVICE_STATE.OFF,
    on,
    canToggle: true,
  };
}