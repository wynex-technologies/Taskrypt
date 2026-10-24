import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';

import { AppText, Button, Card, EmptyState, IconButton, ScalePressable, Screen, SkeletonList } from '@/components';
import { TaskItem } from '@/features/tasks/components/TaskItem';
import { useDueDays, useLists, useTasks } from '@/hooks/queries';
import { addMonths, dayKey, endOfDay, formatDate, formatMonth, isSameDay, startOfDay } from '@/lib/time';
import { useTheme } from '@/theme';

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEK_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export default function Calendar() {
  const theme = useTheme();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const days = useMemo(() => monthGrid(month), [month]);
  const dots = useDueDays(days[0]!, endOfDay(days[41]!));
  const dayTasks = useTasks({ view: 'all', from: startOfDay(selected).toISOString(), to: endOfDay(selected).toISOString(), sort: 'due' });
  const lists = useLists();
  const listMap = useMemo(() => new Map((lists.data ?? []).map((l) => [l.id, l])), [lists.data]);
  const today = new Date();

  const shift = (n: number) => setMonth((m) => addMonths(m, n));
  const swipe = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-20, 20])
    .onEnd((e) => {
      if (e.translationX < -60) runOnJS(shift)(1);
      else if (e.translationX > 60) runOnJS(shift)(-1);
    });

  return (
    <Screen title="Calendar" edgesBottom={false}>
      <Card style={{ gap: 12 }}>
        <View style={styles.head}>
          <IconButton icon={ChevronLeft} label="Previous month" onPress={() => shift(-1)} />
          <AppText variant="heading" accessibilityRole="header" accessibilityLiveRegion="polite">
            {formatMonth(month)}
          </AppText>
          <IconButton icon={ChevronRight} label="Next month" onPress={() => shift(1)} />
        </View>
        <View style={styles.week}>
          {WEEK.map((d, i) => (
            <AppText key={i} variant="caption" color="textSubtle" style={styles.cellText} accessibilityLabel={WEEK_FULL[i]}>
              {d}
            </AppText>
          ))}
        </View>
        <GestureDetector gesture={swipe}>
          <View style={styles.grid}>
            {days.map((d) => {
              const inMonth = d.getMonth() === month.getMonth();
              const isSel = isSameDay(d, selected);
              const isToday = isSameDay(d, today);
              const info = dots.data?.get(dayKey(d));
              return (
                <ScalePressable
                  key={d.toISOString()}
                  onPress={() => setSelected(startOfDay(d))}
                  pressedScale={0.9}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${formatDate(d)}${isToday ? ', today' : ''}${info ? `, ${info.open} open, ${info.done} done` : ''}`}
                  style={[styles.cell, { backgroundColor: isSel ? theme.colors.primary : 'transparent', borderRadius: 14, borderWidth: isToday && !isSel ? 1.5 : 0, borderColor: theme.colors.primary }]}
                >
                  <AppText variant="bodyStrong" style={{ color: isSel ? theme.colors.onPrimary : inMonth ? theme.colors.text : theme.colors.textSubtle, opacity: inMonth ? 1 : 0.5 }}>
                    {d.getDate()}
                  </AppText>
                  <View style={styles.dots}>
                    {info?.open ? <View style={[styles.dot, { backgroundColor: isSel ? theme.colors.onPrimary : theme.colors.primary }]} /> : null}
                    {info?.done ? <View style={[styles.dot, { backgroundColor: isSel ? theme.colors.onPrimary : theme.colors.success }]} /> : null}
                  </View>
                </ScalePressable>
              );
            })}
          </View>
        </GestureDetector>
        <Button
          label="Today"
          size="sm"
          variant="ghost"
          onPress={() => {
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelected(startOfDay(today));
          }}
        />
      </Card>

      <View style={{ gap: 10, marginTop: theme.spacing.xl }}>
        <View style={styles.head}>
          <AppText variant="heading">{isSameDay(selected, today) ? 'Today' : formatDate(selected)}</AppText>
          <Button label="Add" icon={Plus} size="sm" variant="soft" onPress={() => router.push({ pathname: '/tasks/new', params: { date: dayKey(selected) } })} />
        </View>
        {dayTasks.isLoading ? (
          <SkeletonList rows={2} />
        ) : (dayTasks.data?.length ?? 0) === 0 ? (
          <EmptyState compact title="Free day" body="Nothing scheduled. Tap Add to plan something." mood="idle" />
        ) : (
          dayTasks.data?.map((t) => <TaskItem key={t.id} task={t} listColor={t.list_id ? listMap.get(t.list_id)?.color : undefined} listName={t.list_id ? listMap.get(t.list_id)?.name : undefined} />)
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  week: { flexDirection: 'row' },
  cellText: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, maxHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
