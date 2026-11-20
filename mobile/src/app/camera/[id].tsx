import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { buildLivePlayerUrl } from '../../config/urls';
import { useSession } from '../../session/SessionProvider';
import { colors } from '../../theme';

/**
 * Plays the annotated stream with MediaMTX's built-in WebRTC player inside a WebView,
 * the same player the web frontend embeds. Works in Expo Go (no native WebRTC module).
 */
export default function CameraLiveScreen() {
  const { name, livePath } = useLocalSearchParams<{ id: string; name?: string; livePath?: string }>();
  const { server } = useSession();
  const [failed, setFailed] = useState(false);

  if (!server.mediamtxUrl || !livePath) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Configura la URL de video en vivo en el perfil.</Text>
      </View>
    );
  }

  const uri = buildLivePlayerUrl(server.mediamtxUrl, livePath);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: name ?? 'En vivo' }} />
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.error}>No se pudo abrir el video.</Text>
          <Text style={styles.muted}>{uri}</Text>
        </View>
      ) : (
        <WebView
          source={{ uri }}
          style={styles.video}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1, backgroundColor: '#000' },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: 24,
    gap: 8,
  },
  muted: { color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.danger, fontWeight: '600' },
});
