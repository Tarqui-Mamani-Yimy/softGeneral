import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSession } from '../session/SessionProvider';
import { colors } from '../theme';

/** Lets the user point the app at the backend and MediaMTX of their network. */
export function ServerSettings({ onSaved }: { onSaved?: () => void }) {
  const { server, saveServer } = useSession();
  const [apiUrl, setApiUrl] = useState(server.apiUrl);
  const [mediamtxUrl, setMediamtxUrl] = useState(server.mediamtxUrl);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await saveServer({ apiUrl, mediamtxUrl });
    setSaved(true);
    onSaved?.();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>URL de la API</Text>
      <TextInput
        style={styles.input}
        value={apiUrl}
        onChangeText={(text) => {
          setApiUrl(text);
          setSaved(false);
        }}
        placeholder="http://192.168.1.20:8000/api/v1"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text style={styles.label}>URL de video en vivo (MediaMTX)</Text>
      <TextInput
        style={styles.input}
        value={mediamtxUrl}
        onChangeText={(text) => {
          setMediamtxUrl(text);
          setSaved(false);
        }}
        placeholder="http://192.168.1.20:8889"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Pressable style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>{saved ? 'Guardado ✓' : 'Guardar servidor'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: { color: colors.textMuted, fontSize: 13 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    marginTop: 4,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: colors.primary, fontWeight: '600' },
});
