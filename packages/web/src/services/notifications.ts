import api from './api';

// Served by the API so self-hosted deployments can enable push without a
// frontend rebuild; the build-time env var remains as a fallback.
let cachedVapidKey: string | null | undefined;

export async function getVapidPublicKey(): Promise<string | null> {
  if (cachedVapidKey !== undefined) return cachedVapidKey;
  let key: string | null;
  try {
    const { data } = await api.get('/notifications/vapid-public-key');
    key = data.data.publicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY || null;
  } catch {
    key = import.meta.env.VITE_VAPID_PUBLIC_KEY || null;
  }
  cachedVapidKey = key;
  return key;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }
  return Notification.requestPermission();
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service worker registered');
    return registration;
  } catch (err) {
    console.error('Service worker registration failed:', err);
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) {
    console.warn('VAPID public key not configured');
    return false;
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return false;
  }

  const registration = await registerServiceWorker();
  if (!registration) return false;

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    });

    const json = subscription.toJSON();
    await api.post('/notifications/subscribe-push', {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
    });

    return true;
  } catch (err) {
    console.error('Push subscription failed:', err);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const registration = await navigator.serviceWorker?.ready;
  if (!registration) return false;

  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api.post('/notifications/unsubscribe-push', {
        endpoint: subscription.endpoint,
      });
      await subscription.unsubscribe();
    }
    return true;
  } catch (err) {
    console.error('Push unsubscribe failed:', err);
    return false;
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
