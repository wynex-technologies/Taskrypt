import * as Network from 'expo-network';
import { create } from 'zustand';

type NetworkState = {
  isOnline: boolean;
  isCellular: boolean;
  known: boolean;
  /** Simulate offline from the sync screen (useful for demos and QA). */
  forcedOffline: boolean;
  setForcedOffline: (v: boolean) => void;
};

function online(s: Network.NetworkState): boolean {
  // isInternetReachable can be null while unknown; treat as online if connected.
  return Boolean(s.isConnected) && s.isInternetReachable !== false;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: true,
  isCellular: false,
  known: false,
  forcedOffline: false,
  setForcedOffline: (v) => set({ forcedOffline: v }),
}));

let started = false;

export function startNetworkMonitoring(): () => void {
  if (started) return () => undefined;
  started = true;
  const apply = (s: Network.NetworkState) =>
    useNetworkStore.setState({ isOnline: online(s), isCellular: s.type === Network.NetworkStateType.CELLULAR, known: true });
  Network.getNetworkStateAsync().then(apply).catch(() => undefined);
  const sub = Network.addNetworkStateListener(apply);
  return () => {
    sub.remove();
    started = false;
  };
}

export function isEffectivelyOnline(): boolean {
  const s = useNetworkStore.getState();
  return s.isOnline && !s.forcedOffline;
}

export function useIsOnline(): boolean {
  return useNetworkStore((s) => s.isOnline && !s.forcedOffline);
}
