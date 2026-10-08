/** Layout-viewport resize (Android) and visual-only resize (iOS) need different
 * offsets: hide navigation for either keyboard, but never subtract it twice. */
export function resolvePhoneKeyboard({editing, restingHeight, layoutHeight, visualHeight, offsetTop = 0, scale = 1}: {editing: boolean; restingHeight: number; layoutHeight: number; visualHeight: number; offsetTop?: number; scale?: number}) {
  const open = editing && Math.abs(scale - 1) < 0.05 && restingHeight - visualHeight > 100;
  return {open, inset: open ? Math.max(0, layoutHeight - visualHeight - offsetTop) : 0};
}
