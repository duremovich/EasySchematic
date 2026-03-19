import { describe, it, expect } from 'vitest';
import { SIGNAL_LABELS, SIGNAL_COLORS, CONNECTOR_LABELS } from '../types';

describe('type consistency', () => {
  it('SIGNAL_COLORS has entry for every SignalType in SIGNAL_LABELS', () => {
    for (const key of Object.keys(SIGNAL_LABELS)) {
      expect(SIGNAL_COLORS).toHaveProperty(key);
    }
  });

  it('SIGNAL_LABELS has entry for every SignalType in SIGNAL_COLORS', () => {
    for (const key of Object.keys(SIGNAL_COLORS)) {
      expect(SIGNAL_LABELS).toHaveProperty(key);
    }
  });

  it('CONNECTOR_LABELS is non-empty', () => {
    expect(Object.keys(CONNECTOR_LABELS).length).toBeGreaterThan(0);
  });
});
