import type { MascotMood } from './mascotStore';

/**
 * ─── Rive character asset ────────────────────────────────────────────────────
 *
 * Taskrypt renders Kora with Rive when a production character file is present,
 * and falls back to the hand-built vector + Reanimated character otherwise.
 *
 * To ship the Rive character:
 *   1. Export the file from the Rive editor as  assets/rive/kora.riv
 *   2. Give it a state machine named  "Kora"  with these inputs:
 *        - number  "mood"   (values below)
 *        - trigger "react"  (fired on every transient reaction)
 *        - boolean "reducedMotion"
 *   3. Set RIVE_ENABLED to true and uncomment the require() below.
 *   4. Rebuild the development client (Rive is a native module, not in Expo Go).
 */
export const RIVE_ENABLED = false;

export const RIVE_SOURCE: number | null = RIVE_ENABLED ? null /* require('../../../assets/rive/kora.riv') */ : null;

export const RIVE_STATE_MACHINE = 'Kora';
export const RIVE_ARTBOARD = 'Kora';

export const RIVE_MOOD_VALUES: Record<MascotMood, number> = {
  idle: 0,
  welcome: 1,
  taskAdded: 2,
  taskCompleted: 3,
  goalAchieved: 4,
  empty: 5,
  loading: 6,
  error: 7,
  offline: 8,
  documentSaved: 9,
};
