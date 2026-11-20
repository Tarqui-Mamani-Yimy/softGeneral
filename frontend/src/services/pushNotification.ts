/**
 * Service Worker & Native Push Notification Manager for SIV-Estadio Mobile & Desktop
 */

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (err) {
    console.warn('[PWA] Service Worker registration failed:', err);
    return null;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('[Push] Error requesting notification permission:', err);
    return 'denied';
  }
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

export async function sendNativePushNotification(options: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') return false;
  }

  const { title, body, tag = 'siv-alert', url = '/alerts' } = options;

  // Try via ServiceWorkerRegistration for full background push support on mobile
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg) {
        const swOptions = {
          body,
          icon: '/icon.svg',
          badge: '/icon.svg',
          tag,
          data: { url },
          vibrate: [200, 100, 200],
        };
        await (reg as unknown as { showNotification: (t: string, o: unknown) => Promise<void> }).showNotification(
          title,
          swOptions
        );
        return true;
      }
    } catch {
      // Fall back to window Notification
    }
  }

  // Fallback to standard Notification API
  try {
    const n = new Notification(title, {
      body,
      icon: '/icon.svg',
      tag,
      data: { url },
    });
    n.onclick = () => {
      window.focus();
      window.location.href = url;
    };
    return true;
  } catch {
    return false;
  }
}
