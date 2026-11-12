import { api } from './api.js';
import { load, save } from './storage.js';

/**
 * Web Push. Tillstånd begärs aldrig vid start, bara när användaren själv trycker på
 * "Slå på notiser" (efter en check-in eller i Inställningar).
 */
const ASKED_KEY = 'gatelog.pushAsked';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Ska vi erbjuda push (stöds, inte redan besvarat, inte avböjt i appen)? */
export const shouldOfferPush = () =>
  pushSupported() && Notification.permission === 'default' && !load(ASKED_KEY, false);

export const markPushOffered = () => save(ASKED_KEY, true);

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error('Service workern är inte aktiv ännu. Ladda om appen och försök igen.')), 5000)
    )
  ]);
  return reg;
}

/** Nuvarande läge: 'unsupported' | 'denied' | 'on' | 'off'. */
export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await registration();
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function enablePush() {
  markPushOffered();
  const { enabled, publicKey } = await api.pushKey();
  if (!enabled || !publicKey) throw new Error('Push-notiser är inte aktiverade på servern.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notiser är blockerade. Du kan tillåta dem i webbläsarens inställningar.');
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = sub.toJSON();
  await api.pushSubscribe({ endpoint: json.endpoint, keys: json.keys });
  return 'on';
}

export async function disablePush() {
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api
      .pushUnsubscribe(sub.endpoint)
      .catch((e) => console.warn('Kunde inte avregistrera push på servern:', e.message));
    await sub.unsubscribe();
  }
  return 'off';
}
