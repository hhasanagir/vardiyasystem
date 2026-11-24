export const CONTEXT_MENU_MARGIN = 8;

export interface ContextMenuPositionOptions {
  menuWidth: number;
  menuHeight: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export function clampContextMenuPosition(
  clientX: number,
  clientY: number,
  options: ContextMenuPositionOptions,
): { x: number; y: number } {
  const viewportWidth = options.viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
  const viewportHeight = options.viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 0);
  const width = viewportWidth > 0 ? viewportWidth : 320;
  const height = viewportHeight > 0 ? viewportHeight : 480;
  const min = CONTEXT_MENU_MARGIN;
  const maxX = width - options.menuWidth - CONTEXT_MENU_MARGIN;
  const maxY = height - options.menuHeight - CONTEXT_MENU_MARGIN;
  return {
    x: Math.min(Math.max(clientX, min), Math.max(min, maxX)),
    y: Math.min(Math.max(clientY, min), Math.max(min, maxY)),
  };
}