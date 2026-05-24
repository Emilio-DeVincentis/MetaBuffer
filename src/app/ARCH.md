# Application Bridge Architecture (Shell)

The Shell (`src/app/Shell.js`) is the orchestration layer between the deterministic State Engine (Kernel) and the Host Environment (NeutralinoJS/Browser).

---

## 1. Responsibilities
1.  **Event Normalization:** Translates Native Host events (OS signals, UI input) into Kernel commands.
2.  **State Lifecycle:** Manages Kernel initialization, persistence, and disaster recovery.
3.  **IO Management:** Handles non-deterministic operations (File system access, child process execution, network calls).
4.  **UI Projection:** Distributes the Kernel context to UI components (CodeMirror, xterm.js).

---

## 2. Data Flow (Mirror Cycle)
The system follows a strict unidirectional data flow:
`Host Event` ➔ `Shell.handleEvent()` ➔ `Kernel.dispatch()` ➔ `Shell.sync()` ➔ `UI.render()`.

### 2.1 Side-Effect Handling
Asynchronous operations (e.g., executing code or requesting AI results) occur in the Shell:
1.  Kernel sets a `REQUESTED` flag in the context.
2.  Shell detects the flag and initiates the external process.
3.  Upon completion, Shell dispatches a new command to the Kernel to consolidate the result.

### 2.2 Persistence Layer
*   **Atomic Write:** Uses a "write-temp + move" pattern on the File System to prevent data corruption.
*   **Checksum Validation:** Verifies session integrity during hydration.
*   **Storage Drivers:** Supports both File System (Native) and IndexedDB (Web) backends.

---

## 3. UI Integration (Passive Projection)
UI components are stateless views of the Kernel context.
*   **Text Editing:** Ephemeral keystrokes are buffered in the Shell and committed to the Kernel only on specific triggers (focus change, save command).
*   **Terminal:** Direct rendering of the `runtime_output` array projected from the state.
*   **Layout:** Determined by the `active_buffers` and `focus_stack` keys in the context.
