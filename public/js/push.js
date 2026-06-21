/**
 * Client-side push subscription logic. Talks to /api/push/* (subscribe,
 * unsubscribe, favorites sync) and wraps the browser's PushManager API.
 *
 * Note: this is genuinely unsupported in some browsers (notably iOS
 * Safari unless the site has been added to the home screen, on iOS
 * 16.4+) — isSupported() reflects only "does this browser have the
 * APIs", the UI layer is responsible for hiding the bell entirely when
 * the server hasn't enabled push either.
 */

const SUPPORTED = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isSupported() {
  return SUPPORTED;
}

export async function getExistingSubscription() {
  if (!SUPPORTED) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribe(publicKey, favorites) {
  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), favorites: favorites || [] }),
  });

  return sub;
}

export async function unsubscribe() {
  const sub = await getExistingSubscription();
  if (!sub) return;
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}

/** Call whenever favorites change — keeps server-side targeting current without resubscribing. */
export async function syncFavorites(favorites) {
  const sub = await getExistingSubscription();
  if (!sub) return;
  await fetch('/api/push/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, favorites: favorites || [] }),
  }).catch(() => {});
}
