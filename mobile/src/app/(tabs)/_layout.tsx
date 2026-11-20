import { Redirect, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Text, type ColorValue } from 'react-native';

import { ensureNotificationPermission } from '../../notifications';
import { useSession } from '../../session/SessionProvider';
import { colors } from '../../theme';

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { user, can } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    void ensureNotificationPermission();
    // Tapping an alert notification opens its detail screen.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const alertId = response.notification.request.content.data?.alertId;
      if (typeof alertId === 'string') router.push(`/alert/${alertId}`);
    });
    return () => subscription.remove();
  }, [user, router]);

  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alertas',
          tabBarIcon: ({ color }) => <TabIcon glyph="⚠" color={color} />,
        }}
      />
      <Tabs.Screen
        name="cameras"
        options={{
          title: 'Cámaras',
          href: can('cameras.read') ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <TabIcon glyph="☰" color={color} />,
        }}
      />
    </Tabs>
  );
}
