import { create } from 'zustand';

/**
 * Kora, Taskrypt's companion, reacts to real application events. Transient
 * reactions play once and fall back to the ambient state (idle / offline /
 * empty / loading) that the current screen reports.
 */
export type MascotMood =
  | 'idle'
  | 'welcome'
  | 'taskAdded'
  | 'taskCompleted'
  | 'goalAchieved'
  | 'empty'
  | 'loading'
  | 'error'
  | 'offline'
  | 'documentSaved';

export const TRANSIENT_MOODS: Partial<Record<MascotMood, number>> = {
  welcome: 2600,
  taskAdded: 1600,
  taskCompleted: 1900,
  goalAchieved: 3600,
  error: 2600,
  documentSaved: 1800,
};

export const MOOD_MESSAGES: Record<MascotMood, string> = {
  idle: '',
  welcome: 'Hi again! Ready when you are.',
  taskAdded: 'Got it — added to your plan.',
  taskCompleted: 'Nice work! One less thing.',
  goalAchieved: 'Daily goal reached! Take a bow.',
  empty: 'A clean slate. What is first?',
  loading: 'Fetching your things…',
  error: 'Hmm, that did not work. Let us try again.',
  offline: 'You are offline — I will keep everything safe and sync later.',
  documentSaved: 'Saved and encrypted. Snug as a bug.',
};

type MascotState = {
  ambient: MascotMood;
  reaction: { mood: MascotMood; id: number } | null;
  react: (mood: MascotMood) => void;
  setAmbient: (mood: MascotMood) => void;
  clearReaction: (id: number) => void;
};

let counter = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useMascotStore = create<MascotState>((set, get) => ({
  ambient: 'idle',
  reaction: null,
  react: (mood) => {
    // A goal celebration is never pre-empted by a smaller reaction.
    const current = get().reaction;
    if (current?.mood === 'goalAchieved' && mood !== 'goalAchieved') return;
    const id = ++counter;
    set({ reaction: { mood, id } });
    const ms = TRANSIENT_MOODS[mood];
    if (ms) timers.set(id, setTimeout(() => get().clearReaction(id), ms));
  },
  setAmbient: (mood) => set({ ambient: mood }),
  clearReaction: (id) => {
    timers.delete(id);
    if (get().reaction?.id === id) set({ reaction: null });
  },
}));

export function currentMood(s: Pick<MascotState, 'ambient' | 'reaction'>): MascotMood {
  return s.reaction?.mood ?? s.ambient;
}

/** Fire-and-forget helper for services. */
export const mascot = {
  react: (mood: MascotMood) => useMascotStore.getState().react(mood),
};
