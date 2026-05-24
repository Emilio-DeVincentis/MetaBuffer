# Audit Log Policy (Event Recording)

This document defines the engineering rules for recording state transitions in the Audit Log (Trace Stack).

## 1. Recording Criteria

### 1.1 Structural Transitions (Must Record)
An `AuditRecord` must be generated when a transition affects the system's execution structure or control flow:
*   **Focus Management:** Moving the active focus between plugins.
*   **Plugin Lifecycle:** Registration, activation, or removal of a logic unit.
*   **Async Handover:** Transitioning a service status to `REQUESTED` (e.g., initiating a build or AI task).
*   **Data Commitment:** Formal acceptance of external/async results into the context.

### 1.2 Operational Mutations (Do Not Record)
Transitions that are high-frequency or do not affect control flow should return `audit: null`:
*   **Buffered Text Input:** Character-by-character typing.
*   **Streaming Data:** Individual chunks of stdout/stderr from a running process.
*   **Background Tasks:** Periodic diagnostic updates or polling results that don't trigger state changes.

---

## 2. Technical Implementation
In the `apply()` function of a plugin:
```javascript
// Structural change
return {
  delta: { patch: { focused_id: 10 } },
  audit: { metadata: { type: 'FOCUS_SHIFT' } }
};

// Content change
return {
  delta: { patch: { content: '...' } },
  audit: null
};
```

## 3. Rationale
The Audit Log is optimized for **Deterministic Time-Travel**. By excluding high-frequency content updates, the log size remains $O(\text{control depth})$, ensuring sub-millisecond state reconstruction regardless of the amount of text edited.
