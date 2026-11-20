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

/**
 * Generates an audible security siren tone using the Web Audio API
 */
export function playSecurityAlertSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Urgent high-low security siren tone
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.45);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.6);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.65);
  } catch (err) {
    console.warn('[Audio] Could not play alert sound:', err);
  }
}

/**
 * Triggers hardware vibration on mobile devices
 */
export function triggerVibration(): void {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([400, 150, 400, 150, 600]);
    } catch {
      // ignore
    }
  }
}

export async function sendNativePushNotification(options: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}): Promise<boolean> {
  // Always trigger sound and vibration on alert
  triggerVibration();
  playSecurityAlertSound();

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
          vibrate: [500, 150, 500, 150, 600],
          silent: false,
          requireInteraction: true,
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
      silent: false,
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
