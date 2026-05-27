// @ts-check
import { describe, it, expect } from 'vitest';
import { PieceTable } from '../src/core/storage/PieceTable.js';

describe('PieceTable', () => {
  it('should initialize with content', () => {
    const pt = new PieceTable('Hello World');
    expect(pt.length).toBe(11);
    expect(pt.slice(0, 11)).toBe('Hello World');
  });

  it('should insert text', () => {
    const pt = new PieceTable('Hello World');
    pt.insert(5, ' Beautiful');
    expect(pt.slice(0, pt.length)).toBe('Hello Beautiful World');
  });

  it('should delete text', () => {
    const pt = new PieceTable('Hello Beautiful World');
    pt.delete(5, 10);
    expect(pt.slice(0, pt.length)).toBe('Hello World');
  });

  it('should handle markers', () => {
    const pt = new PieceTable('Hello World');
    pt.setMarker('m1', 6, 'forward');

    pt.insert(5, '!');
    // Hello! World
    // 012345678901
    expect(pt.getMarkerOffset('m1')).toBe(7);

    pt.delete(0, 5);
    // ! World
    // 01234567
    expect(pt.getMarkerOffset('m1')).toBe(2);
  });
});
