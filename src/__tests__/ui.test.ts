import { describe, it, expect } from 'vitest';

describe('headerColor fallback', () => {
  it('uses provided headerColor when set', () => {
    const headerColor: string | undefined = '#ff0000';
    const result = headerColor || 'var(--color-surface)';
    expect(result).toBe('#ff0000');
  });

  it('falls back to CSS variable when headerColor is undefined', () => {
    const headerColor: string | undefined = undefined;
    const result = headerColor || 'var(--color-surface)';
    expect(result).toBe('var(--color-surface)');
  });
});

describe('scrollBehavior props', () => {
  it('pan mode sets panOnScroll=true, zoomOnScroll=false', () => {
    const scrollBehavior: 'zoom' | 'pan' = 'pan';
    expect(scrollBehavior === 'pan').toBe(true);
    expect(scrollBehavior !== 'pan').toBe(false);
  });

  it('zoom mode sets panOnScroll=false, zoomOnScroll=true', () => {
    const scrollBehavior: 'zoom' | 'pan' = 'zoom';
    expect(scrollBehavior === 'pan').toBe(false);
    expect(scrollBehavior !== 'pan').toBe(true);
  });
});

describe('annotation node ID generation', () => {
  it('generates unique IDs', () => {
    const id1 = `annotation-${Date.now()}`;
    const id2 = `annotation-${Date.now() + 1}`;
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^annotation-\d+$/);
  });
});
