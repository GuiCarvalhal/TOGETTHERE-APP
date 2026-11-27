// Pure derivation of THIS device's push state.
//
// Notification.permission alone is not the device state: a user can keep the
// permission granted and still be opted out of push (OneSignal
// User.PushSubscription.optedIn / subscribed = false). Deriving the switch from
// the permission only is what made the toggle snap back on after a refresh.

export const DEVICE_STATE = {
  UNCONFIGURED: 'unconfigured',
  UNSUPPORTED: 'unsupported',
  BLOCKED: 'blocked',
  LOADING: 'loading',
  ON: 'on',
  OFF: 'off',
};

export function deriveDeviceState({
  configured = false,
  supported = false,
  ready = false,
  permission = 'default',
  optedIn = null,
  subscribed = null,
} = {}) {
  if (!configured) return { status: DEVICE_STATE.UNCONFIGURED, on: false, canToggle: false };
  if (!supported) return { status: DEVICE_STATE.UNSUPPORTED, on: false, canToggle: false };
  // A denied permission cannot be re-requested from the page: the browser has to
  // be changed by the user, so the control is guarded instead of failing silently.
  if (permission === 'denied') return { status: DEVICE_STATE.BLOCKED, on: false, canToggle: false };
  if (!ready) return { status: DEVICE_STATE.LOADING, on: false, canToggle: false };

  const on = permission === 'granted' && optedIn === true && subscribed === true;
  return {
    status: on ? DEVICE_STATE.ON : DEVICE_STATE.OFF,
    on,
    canToggle: true,
  };
}