import { router } from 'expo-router';
import { Bell, ChartColumn, FilePlus, Plus, Search } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Fab, IconButton, ProgressRing, Screen, SkeletonList } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import { useAuthStore } from '@/features/auth/authStore';
import { DocumentRow } from '@/features/documents/components/DocumentRow';
import { SyncBadge } from '@/features/sync/SyncBadge';
import { syncNow, useSyncStore } from '@/features/sync/syncService';
import { TaskItem } from '@/features/tasks/components/TaskItem';
import { useLists, useProfile, useRecentDocuments, useTaskCounts, useTasks } from '@/hooks/queries';
import { greeting } from '@/lib/time';
import { useIsOnline } from '@/stores/networkStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';

export default function Home() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const online = useIsOnline();
  const email = useAuthStore((s) => s.user?.email);
  const profile = useProfile();
  const goal = usePreferencesStore((s) => s.dailyGoal);
  const counts = useTaskCounts();
  const today = useTasks({ view: 'today', limit: 6 });
  const lists = useLists();
  const recent = useRecentDocuments(3);
  const syncing = useSyncStore((s) => s.phase === 'syncing');

  const listMap = useMemo(() => new Map((lists.data ?? []).map((l) => [l.id, l])), [lists.data]);
  const name = profile.data?.display_name ?? email?.split('@')[0] ?? 'there';
  const done = counts.data?.doneToday ?? 0;
  const progress = goal > 0 ? done / goal : 0;
  const empty = !today.isLoading && (today.data?.length ?? 0) === 0;
  const ambient = !online ? 'offline' : today.isLoading ? 'loading' : empty ? 'empty' : 'idle';
  const wide = width >= 700;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        edgesBottom={false}
        onRefresh={() => void syncNow('manual')}
        refreshing={syncing}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon={Search} label="Search" onPress={() => router.push('/search')} />
            <IconButton icon={Bell} label="Reminders" onPress={() => router.push('/reminders')} />
          </View>
        }
      >
        <View style={{ gap: theme.spacing.xl }}>
          <View style={{ gap: 6 }}>
            <AppText variant="overline" color="textMuted">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </AppText>
            <AppText variant="hero" accessibilityRole="header">
              {greeting()}, {name}
            </AppText>
            <SyncBadge />
          </View>

          <Card elevated tone="raised" style={[styles.hero, { flexDirection: wide ? 'row' : 'row' }]} onPress={() => router.push('/stats')} accessibilityLabel={`Daily progress: ${done} of ${goal} tasks done. Opens statistics.`}>
            <Mascot size={wide ? 120 : 96} ambient={ambient} />
            <View style={{ flex: 1, gap: 8 }}>
              <AppText variant="heading">{progress >= 1 ? 'Goal reached!' : done === 0 ? 'Let us get started' : 'Keep the streak going'}</AppText>
              <AppText color="textMuted" variant="label">
                {done} of {goal} tasks done today
              </AppText>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <ChartColumn size={14} color={theme.colors.primary} />
                <AppText variant="caption" color="primary">
                  See your statistics
                </AppText>
              </View>
            </View>
            <ProgressRing value={progress} size={78} label={`${Math.round(Math.min(1, progress) * 100)}%`} color={progress >= 1 ? theme.colors.success : theme.colors.primary} />
          </Card>

          <View style={styles.stats}>
            {[
              { label: 'Due today', value: counts.data?.today ?? 0, view: 'today', tone: theme.colors.primary },
              { label: 'Overdue', value: counts.data?.overdue ?? 0, view: 'overdue', tone: theme.colors.danger },
              { label: 'Upcoming', value: counts.data?.upcoming ?? 0, view: 'upcoming', tone: theme.colors.info },
            ].map((s) => (
              <Card key={s.label} style={{ flex: 1, gap: 2, padding: 14 }} onPress={() => router.push({ pathname: '/tasks', params: { view: s.view } })} accessibilityLabel={`${s.value} ${s.label}`}>
                <AppText variant="title" style={{ color: s.tone }}>
                  {s.value}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {s.label}
                </AppText>
              </Card>
            ))}
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <View style={styles.sectionHead}>
              <AppText variant="heading" accessibilityRole="header">
                Today
              </AppText>
              <Button label="All tasks" variant="ghost" size="sm" onPress={() => router.push('/tasks')} />
            </View>
            {today.isLoading ? (
              <SkeletonList rows={3} />
            ) : empty ? (
              <Card tone="sunken">
                <EmptyState compact title="Nothing due today" body="Add a task or enjoy the calm." actionLabel="Add a task" onAction={() => router.push('/tasks/new')} />
              </Card>
            ) : (
              <View style={{ gap: 10 }}>
                {today.data?.map((t) => (
                  <TaskItem key={t.id} task={t} listColor={t.list_id ? listMap.get(t.list_id)?.color : undefined} listName={t.list_id ? listMap.get(t.list_id)?.name : undefined} />
                ))}
              </View>
            )}
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <View style={styles.sectionHead}>
              <AppText variant="heading" accessibilityRole="header">
                Recent documents
              </AppText>
              <Button label="Open vault" variant="ghost" size="sm" onPress={() => router.push('/documents')} />
            </View>
            {(recent.data?.length ?? 0) === 0 ? (
              <Card tone="sunken" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => router.push('/documents/upload')}>
                <FilePlus color={theme.colors.primary} size={22} />
                <AppText style={{ flex: 1 }} color="textMuted">
                  Your vault is empty. Add your first private document.
                </AppText>
              </Card>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {recent.data?.map((d) => (
                  <DocumentRow key={d.id} doc={d} compact />
                ))}
              </Card>
            )}
          </View>
          <View style={{ height: 80 }} />
        </View>
      </Screen>
      <Fab icon={Plus} label="New task" onPress={() => router.push('/tasks/new')} bottomOffset={8} testID="fab-new-task" />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 14 },
  stats: { flexDirection: 'row', gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
