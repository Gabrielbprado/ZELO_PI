import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as notificationsApi from '../api/notifications';

/**
 * Foreground display behaviour: show a banner + play a sound even when the
 * app is open. Set once at module load.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function resolveProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Request permission, obtain the Expo push token for this device, and persist
 * it server-side. Gracefully no-ops on web (no native push) and never throws —
 * push is a nice-to-have, not a login blocker.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    const settings = await Notifications.getPermissionsAsync();
    let granted = settings.granted;
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const projectId = resolveProjectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (token) await notificationsApi.registerPushToken(token);
  } catch {
    // Swallow — a device without push (simulator, denied permission, missing
    // projectId) should still be able to use the app normally.
  }
}

/** Best-effort removal of this device's token server-side (on logout). */
export async function unregisterFromPush(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await notificationsApi.deletePushToken();
  } catch {
    // ignore
  }
}
