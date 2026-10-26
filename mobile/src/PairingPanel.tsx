import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { LinkState, PairCode, SessionLink } from '../../shared/sessionClient.js';
import { GameButton } from './Button';
import { Text } from './Text';

export function PairingPanel({ visible, onClose, link, state }: {
  visible: boolean; onClose(): void; link: SessionLink; state: LinkState;
}) {
  const [code, setCode] = useState<PairCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { height } = useWindowDimensions();
  const compact = height < 360;
  const linked = Boolean(state.session?.watch_user_id);
  const action = async (unlink = false) => {
    setBusy(true); setError('');
    try {
      if (unlink) { await link.unlink(); setCode(null); }
      else { await link.connect(); setCode(await link.createPairCode()); }
    } catch {
      setError(unlink ? 'No pudimos desvincular el reloj. Inténtalo de nuevo.' : 'No pudimos preparar tu código. Inténtalo de nuevo.');
    } finally { setBusy(false); }
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={[styles.panel, compact && { paddingVertical: 16, gap: 7 }]}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar vinculación" style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <Text style={[styles.title, compact && { fontSize: 22 }]}>{linked ? 'Tu reloj' : 'Vincular reloj'}</Text>
        <Text style={styles.instruction}>{linked ? 'Elige tu próximo personaje desde el reloj.' : 'En tu reloj, abre «Vincular» e introduce este código.'}</Text>
        {linked ? <View style={[styles.codeArea, compact && { minHeight: 68 }]}>
          <Text style={styles.ready}>¡Listos para correr!</Text>
        </View> : <View style={[styles.codeArea, compact && { minHeight: 75 }]}>
          <Text style={styles.codeLabel}>TU CÓDIGO</Text>
          <Text selectable numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={code ? `Código: ${code.code}` : 'Genera tu código'}
            style={[styles.code, compact && { fontSize: 36 }]}>{code?.code || '---- ----'}</Text>
        </View>}
        {!linked && <Text style={styles.helper}>{code
          ? `Válido hasta las ${new Date(code.expires_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
          : 'Genera un código para empezar.'}</Text>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <GameButton label={busy ? 'Espera…' : linked ? 'Desvincular' : code ? 'Nuevo código' : 'Generar código'} compact
            onPress={() => { if (!busy) void action(linked); }}/>
          <GameButton label="Cerrar" onPress={onClose} compact secondary/>
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#171b23c9', alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { width: '86%', maxWidth: 600, alignItems: 'center', paddingHorizontal: 28, paddingVertical: 23,
    gap: 10, backgroundColor: '#233745', borderRadius: 23, borderWidth: 2, borderColor: '#b88c4c',
    shadowColor: '#090f14', shadowOffset: { width: 0, height: 12 }, shadowOpacity: .4, shadowRadius: 20, elevation: 18 },
  close: { position: 'absolute', right: 14, top: 9, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 25, color: '#e6cba0' },
  title: { color: '#fff0d0', fontSize: 27, textAlign: 'center', paddingHorizontal: 22 },
  instruction: { color: '#e5d5b9', textAlign: 'center', fontSize: 12, lineHeight: 19 },
  codeArea: { alignSelf: 'stretch', minHeight: 92, backgroundColor: '#132630', borderRadius: 14,
    borderWidth: 1, borderColor: '#d8a442', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  codeLabel: { fontSize: 9, color: '#d8ba81', letterSpacing: 3 },
  code: { alignSelf: 'stretch', color: '#ffcf57', fontSize: 43, letterSpacing: 5, textAlign: 'center',
    textShadowColor: '#e7a62555', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  ready: { color: '#ffcf57', fontSize: 23, textAlign: 'center' },
  helper: { color: '#d4c4a9', textAlign: 'center', fontSize: 10 },
  error: { color: '#ffc5a2', textAlign: 'center', fontSize: 11, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 14, marginTop: 3 },
});
