import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type FlatListProps } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import type { MascotMood } from '@/features/animation/mascotStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';

type ViewableInfo = Parameters<NonNullable<FlatListProps<unknown>['onViewableItemsChanged']>>[0];

const SLIDES: { mood: MascotMood; title: string; body: string }[] = [
  { mood: 'welcome', title: 'Meet Kora', body: 'Your calm little companion for getting things done. Kora cheers you on and keeps you company.' },
  { mood: 'taskCompleted', title: 'Plan your days', body: 'Tasks with priorities, lists, tags, reminders and repeats — organised around what matters today.' },
  { mood: 'documentSaved', title: 'A private vault', body: 'Keep important documents in a private, encrypted vault. Download them for offline use anytime.' },
  { mood: 'offline', title: 'Works offline', body: 'No signal? Keep working. Everything syncs safely when you are back online.' },
];

export default function Onboarding() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);
  const setPref = usePreferencesStore((s) => s.set);

  const finish = () => {
    setPref('onboardingComplete', true);
    router.replace('/sign-up');
  };

  const onViewable = useCallback(({ viewableItems }: ViewableInfo) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }, []);

  const last = index === SLIDES.length - 1;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.skip}>
        <Button
          label="Skip"
          variant="ghost"
          size="sm"
          onPress={() => {
            setPref('onboardingComplete', true);
            router.replace('/sign-in');
          }}
        />
      </View>
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index: i }) => (
          <View style={[styles.slide, { width }]} accessibilityLabel={`Step ${i + 1} of ${SLIDES.length}: ${item.title}. ${item.body}`}>
            <Mascot size={Math.min(200, width * 0.5)} mood={i === index ? item.mood : 'idle'} />
            <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(400)} style={{ gap: 12, alignItems: 'center', maxWidth: 420 }}>
              <AppText variant="hero" align="center">
                {item.title}
              </AppText>
              <AppText color="textMuted" align="center" style={{ fontSize: 16, lineHeight: 24 }}>
                {item.body}
              </AppText>
            </Animated.View>
          </View>
        )}
      />
      <View style={styles.dots} accessibilityElementsHidden>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, { backgroundColor: i === index ? theme.colors.primary : theme.colors.border, width: i === index ? 22 : 8 }]} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 24, gap: 10, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <Button
          label={last ? 'Create my account' : 'Next'}
          size="lg"
          fullWidth
          onPress={() => (last ? finish() : list.current?.scrollToIndex({ index: index + 1, animated: !theme.reduceMotion }))}
        />
        {last ? (
          <Button
            label="I already have an account"
            variant="ghost"
            fullWidth
            onPress={() => {
              setPref('onboardingComplete', true);
              router.replace('/sign-in');
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skip: { alignItems: 'flex-end', paddingHorizontal: 12, height: 48, justifyContent: 'center' },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 28 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 20 },
  dot: { height: 8, borderRadius: 4 },
});
