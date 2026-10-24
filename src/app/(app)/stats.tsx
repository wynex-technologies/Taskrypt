import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { AppText, Card, ProgressBar, ProgressRing, Screen, Segmented } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import { streakOf } from '@/features/tasks/streak';
import { useCompletionSeries, usePriorityBreakdown, useTaskCounts } from '@/hooks/queries';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';
import { PRIORITY_KEYS, PRIORITY_LABELS } from '@/types/domain';

export default function Stats() {
  const theme = useTheme();
  const [range, setRange] = useState<7 | 30>(7);
  const series = useCompletionSeries(range);
  const long = useCompletionSeries(60);
  const counts = useTaskCounts();
  const breakdown = usePriorityBreakdown();
  const goal = usePreferencesStore((s) => s.dailyGoal);

  const data = series.data ?? [];
  const max = Math.max(goal, ...data.map((d) => d.count), 1);
  const total = data.reduce((a, d) => a + d.count, 0);
  const avg = data.length ? total / data.length : 0;
  const streak = useMemo(() => streakOf(long.data ?? []), [long.data]);
  const goalDays = data.filter((d) => d.count >= goal).length;
  const best = data.reduce((b, d) => (d.count > b.count ? d : b), { day: '', count: 0 });
  const done = counts.data?.doneToday ?? 0;

  return (
    <Screen title="Your progress" subtitle="Small steps, every day." back>
      <View style={{ gap: theme.spacing.xl }}>
        <Card elevated tone="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <ProgressRing value={done / goal} size={96} label={`${done}/${goal}`} sublabel="today" color={done >= goal ? theme.colors.success : theme.colors.primary} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="heading">{streak > 0 ? `${streak}-day streak` : 'Start a streak'}</AppText>
            <AppText color="textMuted" variant="label">
              {streak > 0 ? 'You have completed something every day. Keep it up!' : 'Complete one task today to begin.'}
            </AppText>
          </View>
          <Mascot size={64} mood={done >= goal ? 'goalAchieved' : 'idle'} />
        </Card>

        <View style={styles.grid}>
          {[
            { label: 'Completed', value: total },
            { label: 'Daily average', value: avg.toFixed(1) },
            { label: 'Goal days', value: `${goalDays}/${range}` },
            { label: 'Open tasks', value: counts.data?.open ?? 0 },
          ].map((s) => (
            <Card key={s.label} style={styles.tile} accessibilityLabel={`${s.label}: ${s.value}`}>
              <AppText variant="title">{s.value}</AppText>
              <AppText variant="caption" color="textMuted">
                {s.label}
              </AppText>
            </Card>
          ))}
        </View>

        <Card style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="heading">Completions</AppText>
            <View style={{ width: 160 }}>
              <Segmented value={range} onChange={setRange} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }]} />
            </View>
          </View>
          <View
            style={styles.chart}
            accessible
            accessibilityLabel={`Bar chart of tasks completed per day over the last ${range} days. Total ${total}. Best day ${best.count}.`}
          >
            <View style={[styles.goalLine, { bottom: (goal / max) * 140, borderColor: theme.colors.success }]} />
            {data.map((d, i) => (
              <View key={d.day} style={styles.barCol}>
                <Animated.View
                  entering={theme.reduceMotion ? undefined : FadeInUp.delay(i * (range === 7 ? 40 : 10)).duration(300)}
                  style={{
                    height: Math.max(4, (d.count / max) * 140),
                    width: '100%',
                    maxWidth: 26,
                    borderRadius: 6,
                    backgroundColor: d.count >= goal ? theme.colors.success : d.count > 0 ? theme.colors.primary : theme.colors.surfaceSunken,
                  }}
                />
                {range === 7 ? (
                  <AppText variant="caption" color="textSubtle">
                    {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </AppText>
                ) : null}
              </View>
            ))}
          </View>
          <AppText variant="caption" color="textMuted">
            Green bars met your daily goal of {goal}. Change it in Profile.
          </AppText>
        </Card>

        <Card style={{ gap: 14 }}>
          <AppText variant="heading">By priority</AppText>
          {(breakdown.data ?? []).map((b) => {
            const all = b.open + b.done;
            const pr = theme.colors.priority[PRIORITY_KEYS[b.priority]];
            return (
              <View key={b.priority} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="label">{PRIORITY_LABELS[b.priority]}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {b.done} done · {b.open} open
                  </AppText>
                </View>
                <ProgressBar value={all ? b.done / all : 0} color={pr.fg} label={`${PRIORITY_LABELS[b.priority]} priority completion`} />
              </View>
            );
          })}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', gap: 2 },
  chart: { height: 170, flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: 10 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%' },
  goalLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', opacity: 0.6 },
});
