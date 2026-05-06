// Server-assigned display names. We don't accept client-supplied names —
// no profanity filter, no impersonation, no display-name collisions to worry
// about beyond the per-room ones we resolve here.

const COLORS = [
  'Amber', 'Azure', 'Bronze', 'Cobalt', 'Coral', 'Cream', 'Crimson',
  'Cyan', 'Emerald', 'Ginger', 'Indigo', 'Ivory', 'Jade', 'Lilac',
  'Maroon', 'Mauve', 'Mint', 'Olive', 'Onyx', 'Peach', 'Pearl',
  'Plum', 'Ruby', 'Rust', 'Saffron', 'Sand', 'Slate', 'Teal',
  'Topaz', 'Violet',
];

const ANIMALS = [
  'Beaver', 'Bison', 'Capybara', 'Cheetah', 'Crane', 'Dolphin', 'Eagle',
  'Falcon', 'Finch', 'Fox', 'Hawk', 'Heron', 'Koala', 'Lemur',
  'Lynx', 'Magpie', 'Marmot', 'Moose', 'Otter', 'Owl', 'Panda',
  'Pangolin', 'Penguin', 'Quokka', 'Robin', 'Sparrow', 'Squirrel',
  'Stag', 'Tiger', 'Wolf', 'Wombat',
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Assign a fresh random display name unique within the supplied "taken" set.
 * Falls back to a numeric suffix after several collisions so the function
 * always terminates.
 */
export function assignDisplayName(taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${pick(COLORS)} ${pick(ANIMALS)}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Pool is huge (30 × 31 = 930) so we should never reach here in practice.
  // If we do, append a tiny random suffix.
  const n = Math.floor(Math.random() * 1000);
  return `${pick(COLORS)} ${pick(ANIMALS)} ${n}`;
}
