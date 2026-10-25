/**
 * What the companion is doing. Three moods for now, each one drawn from the
 * same pose — the face and the one part that moves (a cat's tail, a fish's
 * fin, a robot's arm) are what change.
 *
 * - `awake`: blinking, moving slowly.
 * - `asleep`: eyes shut, still. Nobody has touched the app in a while.
 * - `purring`: just petted. Happy eyes, moving fast, hearts.
 */
export type CompanionMood = 'awake' | 'asleep' | 'purring';

export interface CompanionStore {
  mood: CompanionMood;
  setMood: (mood: CompanionMood) => void;
}
