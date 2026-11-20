import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ServerSettings } from '../../components/ServerSettings';
import { useSession } from '../../session/SessionProvider';
import { colors } from '../../theme';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  guard: 'Guardia de seguridad',
};

export default function ProfileScreen() {
  const { user, logout } = useSession();
  if (!user) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{user.full_name}</Text>
        <Text style={styles.muted}>@{user.username}</Text>
        {user.email ? <Text style={styles.muted}>{user.email}</Text> : null}
        <Text style={styles.role}>{ROLE_LABELS[user.role] ?? user.role}</Text>
      </View>

      <Text style={styles.section}>Servidor</Text>
      <View style={styles.card}>
        <ServerSettings />
      </View>

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  name: { color: colors.text, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted },
  role: { color: colors.primary, marginTop: 6, fontWeight: '600' },
  section: { color: colors.textMuted, fontSize: 13, marginTop: 8, textTransform: 'uppercase' },
  logout: {
    marginTop: 12,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: colors.danger, fontWeight: '700' },
});
