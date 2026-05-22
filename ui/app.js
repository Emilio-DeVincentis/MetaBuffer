import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { CommandBridge } from '../src/host/bridge.js';
import { rootBuffer } from '../src/buffers/root.js';
import { editorBuffer } from '../src/buffers/editor.js';
import { jsAnalyzerBuffer } from '../src/buffers/jsAnalyzer.js';
import { agentBuffer } from '../src/buffers/agent.js';
import { executorBuffer } from '../src/buffers/executor.js';
import { projectCode, projectDiagnostics, projectTerminal } from '../src/core/projections.js';
import { hydrateState } from '../src/core/serialization.js';

// Setup Runtime
const runtime = new MetaBufferRuntime();
runtime.registerBuffer(rootBuffer);
runtime.registerBuffer(editorBuffer);
runtime.registerBuffer(jsAnalyzerBuffer);
runtime.registerBuffer(agentBuffer);
runtime.registerBuffer(executorBuffer);

const bridge = new CommandBridge(runtime);

// UI Elements
const editorElement = document.getElementById('editor');
const diagnosticsContent = document.getElementById('diagnostics-content');
const outputContent = document.getElementById('output-content');
const traceContent = document.getElementById('trace-content');
const notificationBanner = document.getElementById('notification-banner');

const btnAnalyze = document.getElementById('btn-analyze');
const btnRun = document.getElementById('btn-run');
const btnKill = document.getElementById('btn-kill');
const btnSave = document.getElementById('btn-save');

// Initialize CodeMirror
const editor = CodeMirror.fromTextArea(editorElement, {
    lineNumbers: true,
    mode: 'javascript',
    theme: 'dracula'
});
window.editor = editor; // Expose for verification/bridge

// Sync UI with State
function updateUI() {
    const context = runtime.getContext();
    const traces = runtime.getTraceStack();

    // 1. Project Code (if changed externally, e.g. time travel)
    const currentCode = projectCode(context);
    if (editor.getValue() !== currentCode && !editor.hasFocus()) {
        editor.setValue(currentCode);
    }

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
        // We don't want to permanenty change the runtime state here,
        // just preview it. Or we can rollback.
        // Task says: "reconstructState and updates the view"
        // Let's preview by temporary overriding the context for the UI
        const previewContext = result.value;
        // In a real implementation, time travel might be a "preview mode"
        // For MVP, let's just use the reconstructed state to update UI elements
        const currentCode = projectCode(previewContext);
        editor.setValue(currentCode);

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

// Event Listeners
editor.on('change', (cm, change) => {
    if (change.origin !== 'setValue') {
        // In CodeMirror 5, we can't easily get just the new characters
        // without some diffing if we want to follow 'UI_INPUT' exactly.
        // For MVP, let's just send the whole new text as an update
        // OR better, we could adjust the editorBuffer to accept full text.
        // Let's stick to the spirit: typing updates buffer.

        // Mocking 'UI_INPUT' as the delta or the full text for simplicity
        // The original editorBuffer appends input. Let's send only the change.
        if (change.text) {
            const input = change.text.join('\n');
            bridge.handleHostEvent({ kind: 'UI_INPUT', payload: input });
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
    }

    bridge.init();
    updateUI();
}

window.onload = boot;
