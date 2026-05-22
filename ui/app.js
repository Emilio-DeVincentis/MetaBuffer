import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { CommandBridge } from '../src/host/bridge.js';
import { rootBuffer } from '../src/buffers/root.js';
import { editorBuffer } from '../src/buffers/editor.js';
import { jsAnalyzerBuffer } from '../src/buffers/jsAnalyzer.js';
import { agentBuffer } from '../src/buffers/agent.js';
import { executorBuffer } from '../src/buffers/executor.js';
import { spatialInspectorBuffer } from '../src/buffers/inspector.js';
import { projectCode, projectDiagnostics, projectTerminal, projectWorkspace } from '../src/core/projections.js';
import { hydrateState } from '../src/core/serialization.js';

// Setup Runtime
const runtime = new MetaBufferRuntime();
runtime.registerBuffer(rootBuffer);
runtime.registerBuffer(editorBuffer);
runtime.registerBuffer(jsAnalyzerBuffer);
runtime.registerBuffer(agentBuffer);
runtime.registerBuffer(executorBuffer);
runtime.registerBuffer(spatialInspectorBuffer);

const bridge = new CommandBridge(runtime);

// Global UI State
const editors = new Map(); // bufferId -> CodeMirror instance

// UI Elements
const ribbon = document.getElementById('niri-ribbon');
const diagnosticsContent = document.getElementById('diagnostics-content');
const outputContent = document.getElementById('output-content');
const traceContent = document.getElementById('trace-content');
const notificationBanner = document.getElementById('notification-banner');

const btnAnalyze = document.getElementById('btn-analyze');
const btnRun = document.getElementById('btn-run');
const btnKill = document.getElementById('btn-kill');
const btnSave = document.getElementById('btn-save');

// Sync UI with State
function updateUI() {
    const context = runtime.getContext();
    const traces = runtime.getTraceStack();

    // 1. Project Workspace (Niri Ribbon)
    renderRibbon(context);

    // 2. Project Diagnostics
    const diagnostics = projectDiagnostics(context);
    diagnosticsContent.innerHTML = '';
    Object.entries(diagnostics).forEach(([source, msgs]) => {
        const div = document.createElement('div');
        div.innerHTML = `<strong>${source}:</strong><ul>${msgs.map(m => `<li>${m}</li>`).join('')}</ul>`;
        diagnosticsContent.appendChild(div);
    });

    // 3. Project Terminal Output
    const output = projectTerminal(context);
    outputContent.innerHTML = output.map(chunk => {
        const color = chunk.type === 'stderr' ? 'red' : (chunk.type === 'exit' ? 'gray' : 'white');
        const text = chunk.type === 'exit' ? `\nProcess exited with code ${chunk.code}` : chunk.text;
        return `<span style="color: ${color}">${text}</span>`;
    }).join('');
    outputContent.scrollTop = outputContent.scrollHeight;

    // 4. Project Traces
    renderTraces(traces);
}

function renderRibbon(context) {
    const workspaces = projectWorkspace(context);
    const focusedId = context.focused_buffer_id;

    // Remove defunct columns
    for (const [id, cm] of editors) {
        if (!workspaces.find(w => w.id === id)) {
            const col = document.getElementById(`col-${id}`);
            if (col) col.remove();
            editors.delete(id);
        }
    }

    workspaces.forEach((ws, index) => {
        let col = document.getElementById(`col-${ws.id}`);
        if (!col) {
            col = document.createElement('div');
            col.id = `col-${ws.id}`;
            col.className = 'column';
            col.innerHTML = `
                <div class="column-header">Buffer ${ws.id} [${ws.kind}]</div>
                <div class="column-content" id="content-${ws.id}"></div>
            `;
            ribbon.appendChild(col);

            if (ws.kind === 'editor') {
                const cm = CodeMirror(document.getElementById(`content-${ws.id}`), {
                    value: ws.content || '',
                    lineNumbers: true,
                    mode: 'javascript',
                    theme: 'dracula'
                });
                window.editor = cm; // Expose last created editor for verification
                cm.on('change', (instance, change) => {
                    if (change.origin !== 'setValue') {
                        // Ensure this buffer is focused before sending input
                        if (context.focused_buffer_id !== ws.id) {
                            bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'FOCUS_BUFFER', bufferId: ws.id } });
                        }
                        bridge.handleHostEvent({ kind: 'UI_INPUT', payload: change.text.join('\n') });
                        updateUI();
                    }
                });
                editors.set(ws.id, cm);
            } else if (ws.kind === 'inspector') {
                const content = document.getElementById(`content-${ws.id}`);
                content.style.padding = '20px';
                content.style.overflowY = 'auto';
                updateInspectorView(ws.id, context);
            }
        }

        // Update active state
        col.classList.toggle('active', ws.id === focusedId);

        // Update content if not focused (prevent cursor reset for current)
        if (ws.kind === 'editor') {
            const cm = editors.get(ws.id);
            if (cm.getValue() !== ws.content && !cm.hasFocus()) {
                cm.setValue(ws.content);
            }
        } else if (ws.kind === 'inspector') {
            updateInspectorView(ws.id, context);
        }
    });

    // Camera movement
    const focusedIndex = workspaces.findIndex(w => w.id === focusedId);
    if (focusedIndex !== -1) {
        const offset = focusedIndex * 80; // 80vw per column
        ribbon.style.transform = `translateX(-${offset}vw)`;
    }
}

function updateInspectorView(id, context) {
    const container = document.getElementById(`content-${id}`);
    if (!container) return;

    const buffers = context.buffers || {};
    const totalBuffers = Object.keys(buffers).length;
    const focusStack = context.focus_stack || [];

    container.innerHTML = `
        <h2>Spatial Inspector</h2>
        <p><strong>Total Buffers:</strong> ${totalBuffers}</p>
        <p><strong>Focused Buffer:</strong> ${context.focused_buffer_id}</p>
        <h3>Focus History</h3>
        <ul>
            ${focusStack.slice(-10).reverse().map(fid => `<li>Buffer ${fid}</li>`).join('')}
        </ul>
        <h3>Buffer List</h3>
        <ul>
            ${Object.values(buffers).map(b => `<li>[${b.id}] ${b.kind} (${b.content?.length || 0} chars)</li>`).join('')}
        </ul>
    `;
}

function renderTraces(traces) {
    traceContent.innerHTML = '';
    traces.slice().reverse().forEach(trace => {
        const div = document.createElement('div');
        div.className = 'trace-item';

        let eventType = 'CONTROL';
        if (trace.id === 1) eventType = 'BOOTSTRAP';
        else if (trace.metaBufferId === 1) eventType = 'ROOT_CMD';
        else if (trace.metaBufferId === 5) eventType = 'RUN';
        else if (trace.metaBufferId === 4) eventType = 'AGENT';

        div.innerHTML = `
            <div><strong>ID:</strong> ${trace.id} [${eventType}]</div>
            <div><strong>Buffer:</strong> ${trace.metaBufferId}</div>
            <div style="font-size: 0.7rem; color: #888;"><strong>Scope:</strong> ${trace.scope.join(', ')}</div>
        `;
        div.onclick = () => timeTravel(trace.id);
        traceContent.appendChild(div);
    });
}

function timeTravel(traceId) {
    const result = runtime.reconstructState(traceId);
    if (result.ok) {
        const previewContext = result.value;

        // Update all UI components with the reconstructed state
        renderRibbon(previewContext);

        // Mark as active trace in UI
        Array.from(traceContent.children).forEach(child => {
            if (child.innerText.includes(`ID: ${traceId}`)) {
                child.classList.add('active');
            } else {
                child.classList.remove('active');
            }
        });

        showNotification(`Previewing state at Trace ${traceId}`, 2000);
    }
}

function showNotification(msg, duration = 3000) {
    notificationBanner.innerText = msg;
    notificationBanner.classList.remove('hidden');
    setTimeout(() => {
        notificationBanner.classList.add('hidden');
    }, duration);
}

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    const context = runtime.getContext();
    const workspaces = projectWorkspace(context);
    const focusedId = context.focused_buffer_id;
    const currentIndex = workspaces.findIndex(w => w.id === focusedId);

    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowRight') {
            const next = workspaces[currentIndex + 1];
            if (next) {
                bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'FOCUS_BUFFER', bufferId: next.id } });
                updateUI();
            }
        } else if (e.key === 'ArrowLeft') {
            const prev = workspaces[currentIndex - 1];
            if (prev) {
                bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'FOCUS_BUFFER', bufferId: prev.id } });
                updateUI();
            }
        } else if (e.key === 'n') {
            e.preventDefault();
            bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'CREATE_BUFFER', kind: 'editor', initialContent: '// New Buffer\n' } });
            updateUI();
        } else if (e.key === 'i') {
            e.preventDefault();
            bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'CREATE_BUFFER', kind: 'inspector' } });
            updateUI();
        }
    }
});

btnAnalyze.onclick = () => {
    bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'ACTIVATE_BUFFER', bufferId: 3 } });
    updateUI();
};

btnRun.onclick = () => {
    bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'ACTIVATE_RUN' } });
    updateUI();
};

btnKill.onclick = () => {
    bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'KILL_RUN' } });
    updateUI();
};

btnSave.onclick = async () => {
    await bridge.saveState();
    showNotification('State saved to disk.');
};

window.addEventListener('kernel-error', (evt) => {
    showNotification(`Kernel Error: ${evt.detail.message} (${evt.detail.code})`, 5000);
});

// Initialization
async function boot() {
    const NL = typeof window !== 'undefined' ? window.NL_ : null;
    let hydrated = false;

    if (NL) {
        try {
            const stateBlob = await NL.filesystem.readFile('./metabuffer_state.json');
            if (stateBlob) {
                const res = hydrateState(runtime, stateBlob);
                if (res.ok) {
                    hydrated = true;
                    showNotification('State hydrated from disk.');
                }
            }
        } catch (e) {
            console.log('No saved state found or failed to load.');
        }
    } else {
        const stateBlob = localStorage.getItem('metabuffer_state');
        if (stateBlob) {
            const res = hydrateState(runtime, stateBlob);
            if (res.ok) {
                hydrated = true;
                showNotification('State hydrated from localStorage.');
            }
        }
    }

    if (!hydrated) {
        runtime.initialize();
        // Create initial editor
        bridge.handleHostEvent({
            kind: 'COMMAND',
            payload: { type: 'CREATE_BUFFER', kind: 'editor', initialContent: '// Welcome to MetaBuffer\n' }
        });
    }

    bridge.init();
    updateUI();
}

window.onload = boot;
