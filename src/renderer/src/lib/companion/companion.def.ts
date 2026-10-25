/**
 * What the cat is doing. Three moods for now, each one drawn from the same
 * sitting pose — the face and the tail are what change.
 *
 * - `awake`: blinking, tail swishing slowly.
 * - `asleep`: eyes shut, tail down. Nobody has touched the app in a while.
 * - `purring`: just petted. Happy eyes, a fast tail, hearts.
 */
export type CatMood = 'awake' | 'asleep' | 'purring';

export interface CompanionStore {
  mood: CatMood;
  setMood: (mood: CatMood) => void;
}
