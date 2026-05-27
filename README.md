# MetaBuffer Architecture Specification (Authoritative)

## Scope
High-performance extensible text environment:
- deterministic core
- Emacs-like extensibility
- UI as passive rendering terminal

NO FALLBACK ARCHITECTURES. THIS IS THE SOURCE OF TRUTH.

---

# 1. SYSTEM OVERVIEW

## Execution Model

Main Thread (UI)│▼ (Input Events: Deltas via EditContext)Web Worker (Core Engine)│▼ (Rendering Payload: HTML String Chunks + Line Metadata)Main Thread (DOM Window)
* **Worker Thread**: Single, absolute source of truth. Owns state, memory buffers, topology, and execution lifecycle.
* **UI Thread**: Stateless, disposable rendering terminal and hardware input forwarder.

---

# 2. CORE PRINCIPLES

* Text state MUST NOT reside in the DOM under any condition.
* The UI MUST NOT mutate or speculative-predict editor state outside structural UI-caret rendering hints.
* All text mutations MUST execute exclusively through the synchronous Core Buffer API.
* The Core Engine MUST be deterministic, deterministic-queued, and single-threaded.
* Rendering pipeline operations MAY be eventually consistent with the Core state.
* Keyboard and hardware input tasks MUST hold absolute priority over background, parsing, and I/O tasks.

---

# 3. STORAGE LAYER

## Data Structure: Piece Tree

To guarantee $O(\log N)$ complexity for random mutations, the Piece Table is implemented as a self-balancing binary search tree (Piece Tree / Red-Black Tree) of structured descriptors.

```text
struct Piece {
  source: ORIGINAL | ADD
  start: int          // Physical byte/code-point offset in target buffer
  length: int         // Length of this specific continuous block
  leftSubtreeLength: int // Cumulative logical length of text in left child nodes
}
```

### Allocation Buffers
* `originalBuffer`: Flat `Uint32Array`, immutable, holding the initial file content mapped on open.
* `addBuffer`: Flat `Uint32Array`, append-only, capturing all new character codes typed during the session.

---

## Operations
* `insert(offset, text)`
* `delete(start, end)`
* `slice(start, end)`

### Complexity Bounds
* **Insert / Delete**: $O(\log N)$ via tree balancing and node splitting.
* **Sequential Read**: $O(1)$ when consuming text through an active tracking Iterator.
* **Random Access**: $O(\log N)$ via balanced root-to-leaf node traversal.

---

## Iterator Model

```javascript
const cursor = buffer.createIterator(offset);
cursor.next(); // O(1) step operation
cursor.prev(); // O(1) step operation
```

* **Rule**: All sequential operations (including rendering loops and string evaluations) MUST consume text through an active Iterator instance. Repeated calls to random-access `resolve(offset)` logic are forbidden during sequential walks.

---

## Markers

### Structure
```text
struct Marker {
  nodeRef: PieceNode,   // Direct reference to the hosting node in the Piece Tree
  localOffset: int,     // Relative offset inside the target physical piece allocation
  affinity: FORWARD | BACKWARD
}
```

### Rules
* Markers MUST remain stable and persistent across arbitrary, non-local buffer edits.
* Markers pointing inside a splitting node MUST be automatically reassigned to the newly spawned tree node during the mutation pass.
* **Sticky Policies**:


| Case | Behavior |
| :--- | :--- |
| **Insert exactly at marker position** | Moves forward if affinity is `FORWARD`; remains anchored if affinity is `BACKWARD`. |
| **Delete range wrapping marker** | Clamps marker coordinate to the bounds of the surviving text block. |

---

## Undo/Redo Matrix

Mutations are replayed through transaction logs without taking snapshots or duplicating arrays.

```text
struct UndoLogRecord {
  type: INSERT | DELETE
  start: int
  end: int
  textBuffer: Uint32Array
}
```

* **Stack Management**: Implemented as dual stack arrays (`undoStack`, `redoStack`). Reversals are calculated by executing the mathematical inverse operation of the logged transaction via the main API.

---

# 4. WORKER CORE

## Responsibilities
* Complete buffer mutation execution.
* Incremental logical line index tracking.
* Parsing orchestration (Tree-sitter WASM and Regex fallbacks).
* Synchronous execution of all extension scripts and macros.
* String-based rendering payload serialization.
* Strict task priority scheduling.

---

## Deterministic Execution
* Single execution thread environment.
* Zero concurrent mutative access.
* Asynchronous operations (like file writes or network I/O) are decoupled from the core thread via message brokers.

---

# 5. SCHEDULER

## Task Classifications

### High Priority (Critical Path)
* Hardware keyboard inputs (`textupdate` events).
* Navigation and cursor positioning directives.

### Medium Priority (Coalesced Path)
* Viewport frame HTML rendering passes.

### Low Priority (Background Path)
* Tree-sitter incremental tree validations.
* Language Server Protocol (LSP) message processing.
* Asynchronous disk autosave operations.

---

## Queue Management
Implemented as a Priority Queue governed by microtask deadlines, replacing simple FIFO structures.

---

## Scheduling Rules
* High Priority input tasks MUST NEVER be blocked or deferred by running background operations.
* Rendering calls are coalesced: multiple sequential inputs inside the same frame window drop intermediate drawing states.
* Background tasks execute strictly during Core thread idle phases using a time-slice budget system.

---

## Coalescing Architecture
```text
[Input Delta 1] -> [Input Delta 2] -> [Input Delta 3] -> Single BSR Frame Output
```

---

## Time Budgets & Deadlines
* **Max Input Latency**: 16ms target response loop window.
* **Plugin Execution Threshold**: Max 2ms per synchronous extension hook call.
* **Parsing Budget**: Max 4ms of Tree-sitter compute slice allowed per frame transaction.

---

# 6. LINE MANAGER

## Structure
```text
lineOffsets:  Int32Array // Logical text offsets where each line begins
lineVersions: Int32Array // Monotonically increasing version markers per line
lineCount:    int        // Active number of tracked lines in buffer
```

---

## Operations
* **Index Querying**: Employs an $O(\log N)$ binary search across `lineOffsets` to resolve char offsets to row indices.
* **Incremental Adaptation**: Text mutations shift downstream offsets and alter the table allocation using `copyWithin()` block updates.
* **Version Control**: Any cell modification increments the corresponding slot in `lineVersions`.

---

# 7. PARSING & SYNTAX HIGHLIGHTING

## Dual-Engine Model
* **Primary Engine**: Asynchronous, incremental Tree-sitter compiling via WebAssembly.
* **Fallback Engine**: Local, fast regular expression tokenizer executed synchronously.

---

## Execution Pipeline
```text
Input received -> 
  Buffer mutated -> 
  Immediate local Regex tokenization -> 
  Render fallback frame -> 
  Decline compute to async Tree-sitter worker pass -> 
  Refine AST -> 
  Re-render semantically accurate frame if state matches
```

---

## Version Validation
* Every AST generation pass is tagged with the precise `bufferVersion` matching the mutation state.
* If a parsing pass finishes but `currentVersion !== ast.version`, the results are stale and MUST be dropped.

---

## Failure Recovery
* If an abstract parsing run takes $>4\text{ms}$, the system temporarily disables Tree-sitter parsing for subsequent keystrokes.
* Full validation resume operations kick in only when the input queue enters an idle phase.

---

# 8. RENDERING: BUFFER-SIDE RENDERING (BSR)

## Strategy
* Line container nodes (`<div class="view-line">`) remain persistent within the DOM layout.
* Individual line inner contents are completely replaced using text string payloads (`innerHTML`).
* **Rule**: Full viewport rebuild actions are forbidden; mutation updates operate on an isolated row-by-row structure.

---

## View Model
Tracked as a discrete, slicing viewport range container:
```text
visibleLines = [ lineStartIndex ... lineEndIndex ]
```

---

## Patch Mechanism
The UI thread parses the inbound frame and executes updates strictly on mismatched structural versions:
```text
if (uiLineElement.dataset.version !== workerLine.version) {
    uiLineElement.innerHTML = workerLine.htmlString;
    uiLineElement.dataset.version = workerLine.version;
}
```

---

## DOM Node Specification
```html
<div class="emacs-gpu-lines-container">
  <div class="view-line" data-line-index="0" data-version="12" style="transform: translate3d(0, 0px, 0);">
    <span class="t-keyword">const</span> <span class="t-variable">x</span> = <span class="t-number">10</span>;
  </div>
  <div class="view-line" data-line-index="1" data-version="4" style="transform: translate3d(0, 19px, 0);">
    <span class="t-comment">// Ephemeral span nodes inside a persistent row shell</span>
  </div>
</div>
```

* **Spans**: Ephemeral, destroyed and recreated on line edits.
* **Lines**: Persistent structural elements tracked by index selectors.
* **Rule**: Fine-grained text diffing loops inside individual row blocks are forbidden.

---

# 9. UI LAYER

## Core Responsibilities
* Intercept all hardware interactions and composition blocks using the `EditContext` API.
* Preserve a lightweight, effemeral graphical cache of the current visible line block.
* Apply incoming state rendering string frames to the DOM window via targeted row patches.
* Track viewport scroll bar shifts and report updated scroll offsets to the Core.
* Position the custom standalone cursor node based on spatial coordinates sent down by the Worker.

---

## State Lifecycle
The UI thread layout state is ephemeral and disposable. It acts as a visual cache representing active lines currently occupying the view container.

---

# 10. INPUT INTERFACE SYSTEM

## API Binding
The system operates **exclusively** on the `EditContext` API. Traditional keyboard hook interceptions, invisible textareas, or contenteditable hacks are banned.

---

## Input Pipeline Flow
Hardware event -> 
EditContext textinput delta ->Immediate postMessage pipeline transfer ->Worker DeterministicQueue entry ->Piece Tree update ->BSR Engine output generation ->UI frame injection patch%%MAGIT_PARSER_PROTECT%%```Caret VisualizationRendered as an isolated, standalone custom DOM node with absolute pixel offsets.Client-Side Prediction: The UI thread pre-shifts the caret visually upon arrow key inputs to mask message latency.Correction Loop: The Worker calculates the authoritative character index and force-aligns the cursor position on the subsequent frame flush.Selection ManagementLogical Domain (Worker): Managed as an ordered array of transaction objects: [{startOffset, endOffset}, ...].Visual Domain (UI): Manifests as pure static CSS styling modifiers (.emacs-selection) applied across target span nodes by the BSR engine.Mouse HandlingMouse dragging and block selections are throttled to 16ms boundaries within the UI thread.Visual selection bounds are computed locally via screen coordinates and dispatched as a simple logical range intent payload ({start, end}) to the Worker.11. COMMUNICATION PROTOCOLInput Vector Payload (UI -> Worker)%%MAGIT_PARSER_PROTECT%%json { "type": "BUFFER/MUTATE", "payload": { "start": 1024, "end": 1025, "text": "a", "version": 452 } } %%MAGIT_PARSER_PROTECT%%Output Vector Payload (Worker -> UI)To optimize data transfers, the row collection is passed as a flat, typed structural layout block accompanied by a continuous HTML payload string.%%MAGIT_PARSER_PROTECT%%json { "type": "UI/FLUSH_FRAME", "bufferVersion": 452, "startLine": 120, "endLine": 160, "lineVersions": [Int32Array],  "htmlFrameChunk": "<div class='view-line'>...</div>", "cursor": { "x": 240, "y": 760 } } %%MAGIT_PARSER_PROTECT%%Geometry Constraints (V1)Linear text layout with uniform line heights (e.g., rigid 19px increments).Coordinate computations are handled strictly through mathematical multiplication: Y = lineIndex * 19.Shared memory structures (SharedArrayBuffer) and atomic synchronization gates are excluded from V1 scope.12. PLUGIN RUNTIME (KERNEL MODE SPECIFICATION)ModelExtensions execute inside the Web Worker space, holding direct, synchronous, un-sandboxed access to the buffer structures, internal tables, and scheduling engines.CapabilitiesDirectly read and mutate character vectors in the active Piece Tree.Inject customs commands into the global execution dispatch dictionary.Append listener routines to core mutation hooks.Insert interception filters into the text processing and rendering pipelines.Structural Hook TargetsbeforeChange(buffer, start, end, text): Sincronous input scrubbing and preprocessing.afterChange(buffer, start, end, text): Incremental indices sync and syntax dispatch.beforeSave(buffer): Code formatting, linting, and workspace file pre-validation.render(buffer, viewport): Injecting dynamic token formatting strings or overlay elements.Performance Monitoring & GatekeepingExtension calls are wrapped in execution timers using performance.now().If a plugin takes \(>2\text{ms}\) during a critical path operation, the engine logs a performance penalty counter to the workspace status bar.Fault Management & RecoveryAn extension error or infinite loop will halt the Core Worker thread.Recovery Action: The UI thread heartbeat monitor detects the hang, terminates the worker, spawns a replacement worker instance, and hydrates the text state using the latest background auto-save file from disk.13. ERROR HANDLING & DATA PROTECTIONCrash Recovery LoopThe UI thread runs an active asynchronous heartbeat loop checking worker responsiveness.If a worker instance hangs or crashes, the UI initializes a recovery setup routine.The state is restored using the latest background file on disk managed by the Neutralinojs file system wrapper [].Auto-Save SubsystemInterval: Fixed execution every 10 seconds during idle worker phases.Data Payload: Serialized map stream capturing the active Piece Tree descriptor arrays and the raw append contents of the addBuffer block.14. ARCHITECTURAL LIMITS & CONSTRAINTSSingle Choke Point: The Worker thread handles all logical computations; an un-optimized plugin can delay downstream tasks.Kernel Trust: No security sandbox wraps extension code. Malicious packages can damage the runtime or compromise local files via Neutralinojs [].Complexity Shifts: By removing complexity from the DOM layer, management tasks shift completely to the core pointer index matrices and tree-balancing code.15. PERFORMANCE TESTING SPECIFICATION (V1 BENCHMARKS)To ensure structural viability before adding high-level features, the architecture must pass three non-negotiable stress tests:Large File Loading: Opening a 50MB flat file text asset MUST process and render the target visible viewport inside a \(<200\text{ms}\) window.Keystroke Processing Lateness: Random inline insertions on a file containing 100,000 text lines MUST complete the pipeline transaction loop (Input to BSR String Generation) in \(<2\text{ms}\).Viewport Scrolling Frame Rate: Rapid vertical page flips via mouse wheel macros MUST execute at a sustained frame rate matching the display hardware (60Hz / 120Hz) without triggering layout drops or text lag.16. NON-GOALSBackwards-compatibility polyfills targeting obsolete browser engines.Sandboxed or constrained permission spaces for third-party plug-ins.Virtual DOM reconciliation loops (React-style recursive diffing checks).DOM-driven text state monitoring or management hacks.17. CONCURRENCY & CONSISTENCY MATRIXLayerConsistency ModelEnforcement EngineWorker CoreImmediate / StrictSingle-Thread Transaction QueueUI Screen LayoutEventual / DeferredCoalesced BSR Frame Injections18. FINAL CONSTRAINT (NON-NEGOTIABLE)The core text data model MUST operate fully decoupled from the DOM. The Engine Core owns the editor state. The User Interface layer is entirely transient, disposable, and replaceable.
