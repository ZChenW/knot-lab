export const sideStorageKey = 'knot-lab.side';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function sideWidthLimit(windowWidth: number): number {
  return Math.max(300, Math.min(720, windowWidth - 484));
}
export function clampSideWidth(width: number, windowWidth: number): number {
  return Math.max(300, Math.min(sideWidthLimit(windowWidth), width));
}
export function defaultSideWidth(windowWidth: number): number {
  return Math.max(300, Math.min(388, windowWidth * 0.36 - 8));
}
export function readSideWidth(storage: Pick<StorageAccess, 'getItem'>): number | null {
  try {
    const value = storage.getItem(sideStorageKey);
    if (value === null || value.trim() === '') return null;
    const width = Number(value);
    return Number.isFinite(width) && width >= 300 && width <= 720 ? width : null;
  } catch {
    return null;
  }
}
export function storeSideWidth(
  storage: Pick<StorageAccess, 'setItem' | 'removeItem'>,
  width: number | null,
): void {
  try {
    if (width === null) storage.removeItem(sideStorageKey);
    else storage.setItem(sideStorageKey, String(width));
  } catch {
    // Resizing still works when persistence is unavailable.
  }
}
