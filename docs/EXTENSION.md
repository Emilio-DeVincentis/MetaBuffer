# Extension Guide

MetaBuffer System is designed to be infinitely extensible via the registration of new MetaBuffers. This guide outlines how to create and integrate new buffers while respecting system invariants.

## Registering New Buffers

MetaBuffers are registered during system initialization in the `ui/main.js` or via the `config.js` for external contributions.

```javascript
import { registerBuffer } from './src/core/MetaBufferRuntime.js';

let kernelState = createInitialState();
kernelState = registerBuffer(kernelState, myNewBuffer);
```

### Registration via `config.js`
For external plugins:
```javascript
// ui/config.js
export const config = {
    externalBuffers: [
        {
            id: 20,
            parentId: 1,
            scope: ['my_key'],
            apply: (view) => { /* ... */ }
        }
    ]
};
```

---

## Genealogy Rules (Parent-Child)

Every MetaBuffer (except the Root) must have a `parentId`.
1.  **Validation**: The Kernel validates that the `parentId` exists in the system during `dispatch()`.
2.  **Hierarchy**: Use genealogy to express logical dependence. A search-results buffer should have the editor it was spawned from as its `parentId`.
3.  **Root**: Only the `rootBuffer` (ID: 1) has `parentId: null`.

---

## Scope Best Practices

Strict scope isolation is the system's primary security and stability mechanism.

### 1. Minimal Privilege
Only declare keys you absolutely need to read or write.
```javascript
scope: ['text_content', 'my_buffer_status'] // GOOD
scope: ['*'] // FORBIDDEN (Reserved for Root)
```

### 2. Namespace Collision Avoidance
If you are creating a shared state key (e.g., in `diagnostics` or `suggestions`), use a unique sub-key or prefix.
```javascript
// Don't overwrite global diagnostics
const patch = { 'diagnostics.my-plugin': results };
```

### 3. Wildcard Restriction
The `*` wildcard scope is hard-coded to be allowed **only** for MetaBuffer ID: 1. Attempting to use it in other buffers will result in write-validation failures.

---

## Writing the `apply` Function

The `apply` function must be a **total function**: it must return a valid result for every possible input state.

```javascript
/** @type {MetaBuffer['apply']} */
export const myBuffer = {
    id: 10,
    parentId: 1,
    scope: ['trigger', 'result'],
    apply: (view) => {
        // 1. Guard against missing data
        if (!view.state.trigger) return { delta: { patch: {} }, trace: null };

        // 2. Perform logic
        const patch = { result: `Processed ${view.state.trigger}`, trigger: null };

        // 3. Return Delta + Trace Intent
        return {
            delta: { patch },
            trace: null // Internal logic mutation
        };
    }
};
```

### Guidelines for `apply`:
*   **No Async**: Never use `async/await` inside `apply`. Use signals to trigger external async work via the Shell.
*   **No Side Effects**: Never use `console.log`, `fetch`, or `window` inside `apply`.
*   **Deterministic**: Given the same `view`, it must always return the same delta.
