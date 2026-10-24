import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

type Props = { visible: boolean; onClose: () => void; title?: string; children: ReactNode };

/** Native modal bottom sheet. Tapping the scrim or the system back closes it. */
export function Sheet({ visible, onClose, title, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={theme.reduceMotion ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={styles.anchor} pointerEvents="box-none">
          <View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radii.xl, borderTopRightRadius: theme.radii.xl, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />
            {title ? (
              <AppText variant="heading" accessibilityRole="header" style={{ marginBottom: 12 }}>
                {title}
              </AppText>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 640, paddingHorizontal: 20, paddingTop: 10 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
});
