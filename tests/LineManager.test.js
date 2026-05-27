// @ts-check
import { describe, it, expect } from 'vitest';
import { LineManager } from '../src/core/storage/LineManager.js';

describe('LineManager', () => {
  it('should initialize with content', () => {
    const lm = new LineManager('Line 1\nLine 2\nLine 3');
    expect(lm.lineOffsets).toEqual([0, 7, 14]);
    expect(lm.getLineIndex(0)).toBe(0);
    expect(lm.getLineIndex(5)).toBe(0);
    expect(lm.getLineIndex(7)).toBe(1);
    expect(lm.getLineIndex(13)).toBe(1);
    expect(lm.getLineIndex(14)).toBe(2);
  });

  it('should handle insertions', () => {
    const lm = new LineManager('Line 1\nLine 2');
    // Line 1\nLine 2
    // 0123456789012
    lm.onInsert(7, 'New Line\n');
    // Line 1\nNew Line\nLine 2
    // 0123456789012345678901
    expect(lm.lineOffsets).toEqual([0, 7, 16]);
    expect(lm.lineVersions[0]).toBe(0);
    expect(lm.lineVersions[1]).toBe(1);
  });

  it('should handle deletions', () => {
    const lm = new LineManager('Line 1\nLine 2\nLine 3');
    // Line 1\nLine 2\nLine 3
    // 012345678901234567890
    lm.onDelete(7, 7, 'Line 2\n');
    // Line 1\nLine 3
    expect(lm.lineOffsets).toEqual([0, 7]);
  });
});
