import type { SolutionVersion } from './types';

export const MAX_SLOTS = 3;

export function canSaveWithoutOverwrite(versions: SolutionVersion[]): boolean {
  return versions.length < MAX_SLOTS;
}

/** When slots aren't full, pass overwriteIndex as null to append; once full, an index must be given to overwrite */
export function saveVersion(
  versions: SolutionVersion[],
  incoming: SolutionVersion,
  overwriteIndex: number | null,
): SolutionVersion[] {
  if (overwriteIndex !== null) {
    if (overwriteIndex < 0 || overwriteIndex >= versions.length) throw new Error('bad slot');
    return versions.map((v, i) => (i === overwriteIndex ? incoming : v));
  }
  if (!canSaveWithoutOverwrite(versions)) throw new Error('slots full, must choose overwrite');
  return [...versions, incoming];
}
