import { create } from 'zustand';

export type TransferKind = 'encrypting' | 'uploading' | 'downloading' | 'decrypting';
export type Transfer = { kind: TransferKind; fraction: number };

type TransferState = {
  transfers: Record<string, Transfer>;
  set: (id: string, t: Transfer) => void;
  clear: (id: string) => void;
  reset: () => void;
};

/** Ephemeral progress for document transfers (never persisted). */
export const useTransferStore = create<TransferState>((set) => ({
  transfers: {},
  set: (id, t) => set((s) => ({ transfers: { ...s.transfers, [id]: t } })),
  clear: (id) =>
    set((s) => {
      const next = { ...s.transfers };
      delete next[id];
      return { transfers: next };
    }),
  reset: () => set({ transfers: {} }),
}));
