import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/database';
import { useAuthStore } from '@/features/auth/authStore';
import { fetchProfile, fetchStorageUsage } from '@/features/profile/profileService';
import { documentRepository, folderRepository, type DocumentFilter } from '@/repositories/documentRepository';
import * as queue from '@/repositories/syncQueueRepository';
import { categoryRepository, listRepository, tagRepository, taskRepository, type TaskFilter } from '@/repositories/taskRepository';
import { useIsOnline } from '@/stores/networkStore';

/**
 * Query hooks over the local database. Keys start with the prefixes the change
 * bus invalidates (see services/queryClient.ts) and include the user id so a
 * different account can never read a cached result.
 */
function useUid() {
  const uid = useAuthStore((s) => (s.status === 'signedIn' || s.status === 'offline' ? s.user?.id ?? null : null));
  return uid;
}

export function useTasks(filter: TaskFilter) {
  const uid = useUid();
  return useQuery({ queryKey: ['tasks', uid, filter], queryFn: () => taskRepository.list(filter), enabled: !!uid, placeholderData: (prev) => prev });
}

export function useTask(id: string | undefined) {
  const uid = useUid();
  return useQuery({ queryKey: ['task', uid, id], queryFn: () => taskRepository.get(id!), enabled: !!uid && !!id });
}

export function useTaskCounts() {
  const uid = useUid();
  return useQuery({ queryKey: ['tasks', uid, 'counts'], queryFn: () => taskRepository.counts(), enabled: !!uid });
}

export function useLists() {
  const uid = useUid();
  return useQuery({ queryKey: ['lists', uid], queryFn: () => listRepository.list(), enabled: !!uid });
}

export function useTags() {
  const uid = useUid();
  return useQuery({ queryKey: ['tags', uid], queryFn: () => tagRepository.list(), enabled: !!uid });
}

export function useCategories() {
  const uid = useUid();
  return useQuery({ queryKey: ['categories', uid], queryFn: () => categoryRepository.list(), enabled: !!uid });
}

export function useCompletionSeries(days: number) {
  const uid = useUid();
  return useQuery({ queryKey: ['stats', uid, 'series', days], queryFn: () => taskRepository.completionSeries(days), enabled: !!uid });
}

export function usePriorityBreakdown() {
  const uid = useUid();
  return useQuery({ queryKey: ['stats', uid, 'priority'], queryFn: () => taskRepository.priorityBreakdown(), enabled: !!uid });
}

export function useDueDays(from: Date, to: Date) {
  const uid = useUid();
  return useQuery({
    queryKey: ['calendar', uid, from.toISOString(), to.toISOString()],
    queryFn: () => taskRepository.dueDays(from, to),
    enabled: !!uid,
    placeholderData: (prev) => prev,
  });
}

export function useDocuments(filter: DocumentFilter) {
  const uid = useUid();
  return useQuery({ queryKey: ['documents', uid, filter], queryFn: () => documentRepository.list(filter), enabled: !!uid, placeholderData: (prev) => prev });
}

export function useDocument(id: string | undefined) {
  const uid = useUid();
  return useQuery({ queryKey: ['document', uid, id], queryFn: () => documentRepository.get(id!), enabled: !!uid && !!id });
}

export function useRecentDocuments(limit = 6) {
  const uid = useUid();
  return useQuery({ queryKey: ['documents', uid, 'recent', limit], queryFn: () => documentRepository.recent(limit), enabled: !!uid });
}

export function useFolders(parentId: string | null) {
  const uid = useUid();
  return useQuery({ queryKey: ['folders', uid, parentId], queryFn: () => folderRepository.list(parentId), enabled: !!uid });
}

export function useAllFolders() {
  const uid = useUid();
  return useQuery({ queryKey: ['folders', uid, 'all'], queryFn: () => folderRepository.all(), enabled: !!uid });
}

export function useFolderCounts() {
  const uid = useUid();
  return useQuery({ queryKey: ['folders', uid, 'counts'], queryFn: () => folderRepository.counts(), enabled: !!uid });
}

export function useFolderPath(id: string | null) {
  const uid = useUid();
  return useQuery({ queryKey: ['folders', uid, 'path', id], queryFn: () => folderRepository.path(id), enabled: !!uid });
}

export function useLocalStorageUsage() {
  const uid = useUid();
  return useQuery({ queryKey: ['storage', uid, 'local'], queryFn: () => documentRepository.usage(), enabled: !!uid });
}

export function useRemoteStorageUsage() {
  const uid = useUid();
  const online = useIsOnline();
  return useQuery({ queryKey: ['storage', uid, 'remote', online], queryFn: () => fetchStorageUsage(), enabled: !!uid && online, staleTime: 60_000 });
}

export function useProfile() {
  const uid = useUid();
  const online = useIsOnline();
  return useQuery({ queryKey: ['profile', uid, online], queryFn: () => fetchProfile(), enabled: !!uid, staleTime: 5 * 60_000 });
}

export function useQueueItems() {
  const uid = useUid();
  return useQuery({ queryKey: ['sync', uid, 'queue'], queryFn: () => queue.listAll(getDb()), enabled: !!uid });
}
