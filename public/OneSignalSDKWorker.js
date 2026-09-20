// OneSignal Web Push service worker (push-only — no offline caching).
// The Web SDK looks for this file at the site root: /OneSignalSDKWorker.js
// It must be served with content-type: application/javascript from the app origin.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
