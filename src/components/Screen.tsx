import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { IconButton } from './Button';

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Show a back button in the header. */
  back?: boolean;
  right?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
  footer?: ReactNode;
  /** Tabs render their own bottom inset. */
  edgesBottom?: boolean;
  keyboard?: boolean;
};

/** Max readable width on tablets; content centers inside. */
export const CONTENT_MAX_WIDTH = 720;

export function Screen({ children, title, subtitle, back, right, scroll = true, padded = true, refreshing, onRefresh, contentStyle, footer, edgesBottom = true, keyboard }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gutter = width >= 768 ? theme.spacing.xxxl : theme.spacing.xl;

  const header =
    title || back || right ? (
      <View style={[styles.header, { paddingHorizontal: gutter - (back ? 10 : 0) }]}>
        {back ? <IconButton icon={ChevronLeft} label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} /> : null}
        <View style={{ flex: 1 }}>
          {title ? (
            <AppText variant="title" accessibilityRole="header" numberOfLines={2}>
              {title}
            </AppText>
          ) : null}
          {subtitle ? (
            <AppText variant="body" color="textMuted" numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;

  const inner = (
    <View style={[styles.inner, { maxWidth: CONTENT_MAX_WIDTH, paddingHorizontal: padded ? gutter : 0 }, contentStyle]}>{children}</View>
  );

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ paddingBottom: (edgesBottom ? insets.bottom : 0) + theme.spacing.huge, alignItems: 'center' }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} /> : undefined}
    >
      {header}
      {inner}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ alignSelf: 'stretch' }}>{header}</View>
      <View style={[{ flex: 1, alignSelf: 'stretch', alignItems: 'center' }]}>{inner}</View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.lg), paddingHorizontal: gutter, backgroundColor: theme.colors.background, borderTopColor: theme.colors.border },
          ]}
        >
          <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 16, width: '100%', maxWidth: CONTENT_MAX_WIDTH + 64, alignSelf: 'center' },
  inner: { width: '100%', flex: 1 },
  footer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
