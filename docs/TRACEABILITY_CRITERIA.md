# Traceability Criteria

In MetaBuffer System, a `Trace` represents a **structural shift in control causality**. It is not a log of state changes, but a record of why and how the system's control flow moved.

## Trace vs. Null

The decision to emit a trace is governed by the distinction between the **Default World** (ephemeral changes) and a **Broken Illusion** (structural changes).

### 1. Emit `trace: {}` (Structural Change)
You must emit a Trace when the operation affects the system's control structure:

*   **Focus Changes**: Moving the user's attention from one buffer to another.
*   **Lifecycle Events**: Creating, activating, or destroying MetaBuffers.
*   **Agent Takeover**: When an external entity (AI, External Process) assumes control of the system status (e.g., transitioning `agent_status` to `REQUESTED`).
*   **System Mode Shifts**: Switching between `DEFAULT` and `REFLEXIVE` modes.
*   **Formal Commitment**: When non-deterministic data is formally "accepted" into the system context (e.g., `COMMIT_SUGGESTION`).

### 2. Return `trace: null` (Content Mutation)
Return `null` for operations that occur within the established control context:

*   **Keystrokes / Text Editing**: Typing and local text modifications.
*   **Streaming Output**: Incremental updates from a running process (until it exits).
*   **Automatic Analysis**: Background diagnostic updates that don't shift focus or control.
*   **Ephemeral Metadata**: Updates to UI-only state that doesn't affect system causality.

---

## Examples

### Structural: Creating a Buffer
```javascript
// Inside rootBuffer handler
CREATE_BUFFER: (state, payload) => ({
    patch: { /* ... */ },
    trace: {} // Essential: tracks the creation of a new entity
})
```

### Ephemeral: Text Input
```javascript
// Inside editorBuffer
apply: (view) => {
    if (view.state.incoming_input) {
        return {
            delta: { patch: { content: view.state.content + view.state.incoming_input } },
            trace: null // Ephemeral: text editing is "Default World"
        };
    }
}
```

### Structural: Agent Activation
```javascript
// Inside agentBuffer
ACTIVATE: () => ({
    patch: { agent_status: 'REQUESTED' },
    trace: {} // Essential: tracks the transition of control to an agent
})
```

## Guiding Rule
> "If the user performs a Time-Travel operation, would they expect to land exactly on this state change to understand the history of their actions?"

If yes, emit a Trace. If it's a transient step towards a goal, return `null`.
