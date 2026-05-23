# Application Shell Architecture (Phase 6)

The Shell (`src/app/Shell.js`) acts as the "Application Shell" or Host Bridge, providing an impure guscio (shell) around the pure MetaBuffer Kernel.

## 1. Rigid Execution Pipeline
All interactions follow a strictly synchronous mirroring pattern:
`Host Event` ➔ `dispatch()` ➔ `getRuntimeProjections()` ➔ `serialize()` ➔ `write (FS)` ➔ `render (UI)`.

- **Host Events**: UI clicks, typing, or Native Process signals.
- **Dispatch**: The only way to mutate system state.
- **Projections**: Pure functions (`src/core/projections.js`) that transform context into view-ready data.
- **Serialize**: `exportState()` creates a deterministic blob.
- **Write**: Atomic persistence using NeutralinoJS FS API.
- **Render**: UI components (CodeMirror, xterm.js) update their view based on projections.

## 2. Process Isolation & Spawning
The Shell is exclusively responsible for the lifecycle of external processes (e.g., Node.js for code execution).
- The Kernel is **blind** to these processes.
- The Shell observes the `run_status` context key.
- When `REQUESTED`, the Shell spawns the process and transitions state to `RUNNING`.
- Process output is normalized by the Shell and injected into the Kernel via `dispatch()` as discrete `incoming_output_chunk` data.

## 3. Discrete Synchronization (Ephemeral Buffers)
To keep the Kernel's Trace stack mathematically clean:
- **Typing**: Stored in a local `ephemeralTextBuffers` Map within the Shell.
- **Commit**: Typing is only dispatched to the Kernel on focus change or explicit commands (Analyze/Run).
- This ensures that every Trace represents a meaningful structural or logical step, not every keystroke.

## 4. Atomic Persistence
Persistence uses the **Write-Temp + Move (Rename)** pattern:
1. Data is written to `session.tmp`.
2. The file is moved/renamed to `session.json`.
This prevents data corruption during crashes or interrupted I/O.

## 5. UI Components as Passive Projections
- **CodeMirror 6**: Mirroring the active MetaBuffer's text.
- **xterm.js**: Passive view of `runtime_output`. No direct piping; it simply renders the string array projected from the current state.
- **Niri Ribbon**: Horizontal tiling that shifts focus by translating the ribbon container.
