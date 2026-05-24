# MetaBuffer State Engine (Technical Specification)

A deterministic state-store and event-sourcing engine for modular editing environments.

---

## 1. System Architecture

### 1.1 State Store (Kernel)
The core logic is a synchronous, pure function that manages the system state. It implements an **Event Sourcing** pattern where every structural change is recorded in an append-only Audit Log.

*   **Responsibility:** Atomic state transitions, scope validation, and event distribution.
*   **State Interface:**
    ```typescript
    interface KernelState {
      buffers: Map<number, BufferPlugin>; // Registered logic units
      context: Record<string, unknown>;   // Shared data store
      auditLog: AuditRecord[];            // Event history
      snapshots: Map<number, Context>;    // Periodic state captures
    }
    ```

### 1.2 Buffer Plugin
A `BufferPlugin` is the modular unit of logic. It processes inputs and returns state patches.

*   **Interface:**
    ```typescript
    interface BufferPlugin {
      id: number;
      parentId: number | null;
      scope: string[]; // Allowed keys in context
      apply: (view: ContextView) => TransitionResult;
    }
    ```
*   **Input:** `ContextView` (ReadOnly subset of context based on scope + incoming signals).
*   **Output:** `TransitionResult` (State patch + outgoing signals + log intent).

### 1.3 Audit Log (Event Sourcing)
Records state transitions for deterministic reconstruction (Time-Travel).
*   **Requirement:** Only record control-flow events (focus shift, plugin activation). Content updates (typing) are omitted from the log to minimize memory overhead.
*   **Data Structure:** `{ id, pluginId, parentId, delta, metadata }`.

---

## 2. Execution Flow

### 2.1 Dispatch Cycle
1.  **Input:** An external event triggers `dispatch(state, pluginId)`.
2.  **Validation:** The Kernel verifies if the target plugin exists and satisfies genealogy rules.
3.  **View Preparation:** Kernel creates a frozen `ContextView` containing only keys declared in the plugin's `scope`.
4.  **Transition:** Target plugin's `apply()` returns a `ContextDelta`.
5.  **Reaction Pass:** Other plugins receive signals emitted by the target and return their own patches.
6.  **Atomic Commit:** If no write conflicts occur, patches are merged into the context and an `AuditRecord` is appended.

---

## 3. Storage & Persistence
*   **Serialization:** Deterministic JSON serialization with alphabetical key ordering for binary idempotency.
*   **Hydration:** State recovery requires verifying the presence of the `INITIALIZE` record.
*   **Snapshots:** Full context captures every $N$ records to enable $O(1)$ state reconstruction at specific log offsets.

---

## 4. UI Layer Integration
The UI layer is a passive projection of the `KernelState`.
*   **Input:** Receives context updates via the Application Bridge (Shell).
*   **Responsibility:** Rendering text (CodeMirror), terminal output (xterm.js), and layout tiling.
*   **Constraints:** No business logic in the UI layer. All user actions must be dispatched to the Kernel.
