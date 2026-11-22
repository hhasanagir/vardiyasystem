import { describe, expect, it } from 'vitest';
import { clampContextMenuPosition, CONTEXT_MENU_MARGIN } from '../context-menu-position';

describe('P3.3 — clampContextMenuPosition (shared context-menu viewport helper)', () => {
  it('keeps coordinates unchanged when the menu fits inside the viewport', () => {
    const pos = clampContextMenuPosition(400, 300, {
      menuWidth: 224,
      menuHeight: 200,
      viewportWidth: 1024,
      viewportHeight: 768,
    });
    expect(pos).toEqual({ x: 400, y: 300 });
  });

  it('clamps the menu fully inside a 375px phone viewport near the bottom-right edge', () => {
    const pos = clampContextMenuPosition(340, 630, {
      menuWidth: 240,
      menuHeight: 340,
      viewportWidth: 375,
      viewportHeight: 667,
    });
    // maxX = 375 - 240 - 8 = 127; maxY = 667 - 340 - 8 = 319
    expect(pos).toEqual({ x: 127, y: 319 });
    expect(pos.x + 240 + CONTEXT_MENU_MARGIN).toBeLessThanOrEqual(375);
    expect(pos.y + 340 + CONTEXT_MENU_MARGIN).toBeLessThanOrEqual(667);
  });

  it('clamps coordinates near the left/top edge up to the margin', () => {
    const pos = clampContextMenuPosition(2, 3, {
      menuWidth: 224,
      menuHeight: 200,
      viewportWidth: 375,
      viewportHeight: 667,
    });
    expect(pos).toEqual({ x: CONTEXT_MENU_MARGIN, y: CONTEXT_MENU_MARGIN });
  });

  it('never renders beyond the margin even when the menu is larger than the viewport', () => {
    const pos = clampContextMenuPosition(100, 100, {
      menuWidth: 400,
      menuHeight: 800,
      viewportWidth: 320,
      viewportHeight: 568,
    });
    expect(pos).toEqual({ x: CONTEXT_MENU_MARGIN, y: CONTEXT_MENU_MARGIN });
  });

  it('falls back to a sane viewport when no window is available', () => {
    const pos = clampContextMenuPosition(300, 500, {
      menuWidth: 224,
      menuHeight: 200,
      viewportWidth: 0,
      viewportHeight: 0,
    });
    // fallback 320x480; maxX = 320 - 224 - 8 = 88; maxY = 480 - 200 - 8 = 272
    expect(pos).toEqual({ x: 88, y: 272 });
  });
});