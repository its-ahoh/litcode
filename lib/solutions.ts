import type { SolutionVersion } from './types';

export const MAX_SLOTS = 3;

export function canSaveWithoutOverwrite(versions: SolutionVersion[]): boolean {
  return versions.length < MAX_SLOTS;
}

/** 槽位未满时 overwriteIndex 传 null 追加；已满必须指定要覆盖的下标 */
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
