# Plugin Development Guide

This guide defines the API and best practices for extending the system with new logic units (Plugins).

## 1. Plugin Structure
A plugin is a JavaScript object that adheres to the `BufferPlugin` interface.

```javascript
export const myPlugin = {
  id: 10,                 // Unique numeric ID
  parentId: 1,            // Genealogy reference
  scope: ['key1', 'key2'], // Allowed context keys
  apply: (view) => {      // Deterministic transition function
    // View is a ReadOnly subset of context
    return {
      delta: { patch: { key1: 'new value' } },
      audit: null
    };
  }
};
```

## 2. Integration
Plugins are registered in the State Store during initialization.
```javascript
import { registerBuffer } from './src/core/MetaBufferRuntime.js';
state = registerBuffer(state, myPlugin);
```

## 3. Best Practices

### 3.1 Strict Scope Isolation
Plugins must only declare the keys they need to interact with. Accessing or writing keys outside the `scope` array is blocked by the Kernel and will trigger a validation error.

### 3.2 Total Functions
The `apply()` function must be **pure and total**.
*   **No Async:** Do not use `async/await` inside `apply`. Use `signals` to trigger external work in the Shell.
*   **No Side Effects:** Do not call `fetch`, `console.log`, or DOM APIs.
*   **Deterministic:** The same `view` input must always produce the same `delta` output.

### 3.3 Conflict Resolution
The Kernel prevents two plugins from modifying the same context key during a single dispatch cycle. Ensure your plugin operates on its own namespace or coordinated keys.
