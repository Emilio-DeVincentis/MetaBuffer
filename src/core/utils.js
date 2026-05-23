// @ts-check

/**
 * Recursively freezes an object and its properties.
 * Implemented with zero dependencies and high reliability.
 *
 * @template T
 * @param {T} obj - The object to freeze.
 * @returns {Readonly<T>}
 */
export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays and objects
  const props = Object.getOwnPropertyNames(obj);
  for (const prop of props) {
    const value = obj[prop];
    if (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      !Object.isFrozen(value)
    ) {
      deepFreeze(value);
    }
  }

  return Object.freeze(obj);
}

/**
 * Deterministic JSON stringify helper (canonical ordering).
 * Ensures that objects with the same keys in different orders produce identical strings.
 *
 * @param {any} obj - The value to stringify.
 * @returns {string}
 */
export function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
  }

  const keys = Object.keys(obj).sort();
  return '{' + keys.map(key => {
    return JSON.stringify(key) + ':' + canonicalStringify(obj[key]);
  }).join(',') + '}';
}

/**
 * Creates a success Result object.
 * @template T
 * @param {T} data
 * @returns {{ success: true, ok: true, data: T, value: T }}
 */
export const success = (data) => ({
  success: true,
  ok: true,
  data,
  value: data
});

/**
 * Creates a failure Result object.
 * @param {string} code
 * @param {string} message
 * @param {number} [bufferId]
 * @returns {{ success: false, ok: false, error: import('../types/index.js').KernelError }}
 */
export const failure = (code, message, bufferId) => ({
  success: false,
  ok: false,
  error: { code, message, bufferId }
});
