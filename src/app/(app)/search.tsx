import { Search as SearchIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppText, Card, EmptyState, Screen, TextField } from '@/components';
import { DocumentRow } from '@/features/documents/components/DocumentRow';
import { TaskItem } from '@/features/tasks/components/TaskItem';
import { useDocuments, useLists, useTasks } from '@/hooks/queries';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';

/** Local search across tasks and documents — works fully offline. */
export default function Search() {
  const theme = useTheme();
  const online = useIsOnline();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const active = debounced.length > 0;
  const tasks = useTasks({ view: 'all', search: active ? debounced : '__none__', limit: 30 });
  const docs = useDocuments({ folderId: 'all', search: active ? debounced : '__none__', limit: 30 });
  const lists = useLists();
  const listMap = useMemo(() => new Map((lists.data ?? []).map((l) => [l.id, l])), [lists.data]);
  const t = active ? tasks.data ?? [] : [];
  const d = active ? docs.data ?? [] : [];

  return (
    <Screen title="Search" back keyboard>
      <View style={{ gap: theme.spacing.xl }}>
        <TextField icon={SearchIcon} placeholder="Tasks, notes and file names" value={q} onChangeText={setQ} autoFocus returnKeyType="search" accessibilityLabel="Search everything" />
        {!online ? (
          <AppText variant="caption" color="textMuted">
            Offline — searching everything stored on this device.
          </AppText>
        ) : null}
        {!active ? (
          <EmptyState compact title="Find anything" body="Search runs on this device, so it is instant and works offline." mood="idle" />
        ) : t.length + d.length === 0 ? (
          <EmptyState compact title={`Nothing for “${debounced}”`} body="Try fewer words or check the spelling." mood="empty" />
        ) : (
          <>
            {t.length ? (
              <View style={{ gap: 10 }}>
                <AppText variant="overline" color="textMuted" accessibilityRole="header">
                  Tasks · {t.length}
                </AppText>
                {t.map((x) => (
                  <TaskItem key={x.id} task={x} listColor={x.list_id ? listMap.get(x.list_id)?.color : undefined} />
                ))}
              </View>
            ) : null}
            {d.length ? (
              <View style={{ gap: 10 }}>
                <AppText variant="overline" color="textMuted" accessibilityRole="header">
                  Documents · {d.length}
                </AppText>
                <Card style={{ paddingVertical: 4 }}>
                  {d.map((x) => (
                    <DocumentRow key={x.id} doc={x} />
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
