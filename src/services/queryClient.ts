import { QueryClient } from '@tanstack/react-query';

import { subscribeChanges, type ChangeTopic } from '@/database/changes';

/**
 * Local-first: most queries read SQLite, so they run regardless of network
 * ("always") and are invalidated by repository change events instead of timers.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
      staleTime: Infinity,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: 'always', retry: 0 },
  },
});

/** Query-key prefixes that depend on each change topic. */
const TOPIC_KEYS: Record<ChangeTopic, string[]> = {
  tasks: ['tasks', 'task', 'stats', 'calendar', 'search'],
  lists: ['lists', 'tasks'],
  tags: ['tags', 'tasks', 'task'],
  categories: ['categories', 'tasks'],
  documents: ['documents', 'document', 'storage', 'search', 'folders'],
  folders: ['folders', 'documents'],
  khata: ['khata'],
  sync: ['sync'],
};

subscribeChanges((topics) => {
  const keys = new Set<string>();
  topics.forEach((t) => TOPIC_KEYS[t].forEach((k) => keys.add(k)));
  keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));
});
