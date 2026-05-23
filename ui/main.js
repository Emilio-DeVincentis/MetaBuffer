import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { Shell } from '../src/app/Shell.js';
import { rootBuffer } from '../src/buffers/root.js';
import { editorBuffer } from '../src/buffers/editor.js';
import { jsAnalyzerBuffer } from '../src/buffers/jsAnalyzer.js';
import { agentBuffer } from '../src/buffers/agent.js';
import { executorBuffer } from '../src/buffers/executor.js';
import { spatialInspectorBuffer } from '../src/buffers/inspector.js';
import { transformerBuffer } from '../src/buffers/transformer.js';
import { outputBuffer } from '../src/buffers/output.js';

// Setup Core
const runtime = new MetaBufferRuntime();
runtime.registerBuffer(rootBuffer);
runtime.registerBuffer(editorBuffer);
runtime.registerBuffer(jsAnalyzerBuffer);
runtime.registerBuffer(agentBuffer);
runtime.registerBuffer(executorBuffer);
runtime.registerBuffer(spatialInspectorBuffer);
runtime.registerBuffer(transformerBuffer);
runtime.registerBuffer(outputBuffer);

const shell = new Shell(runtime);

// UI Elements
const ribbon = document.getElementById('niri-ribbon');
const diagnosticsContent = document.getElementById('diagnostics-content');
const outputContent = document.getElementById('output-content');
const traceContent = document.getElementById('trace-content');
const notificationBanner = document.getElementById('notification-banner');
const fatalBanner = document.getElementById('fatal-banner');

const btnAnalyze = document.getElementById('btn-analyze');
const btnRun = document.getElementById('btn-run');

const editors = new Map(); // bufferId -> CodeMirror

// --- SHELL EVENT LISTENERS ---

window.addEventListener('shell-render', (e) => {
    const { workspace, focusedId, diagnostics, terminal, traces, isPreview } = e.detail;

    // 1. Ribbon Rendering
    renderRibbon(workspace, focusedId);

    // 2. Diagnostics
    renderDiagnostics(diagnostics);

    // 3. Terminal
    renderTerminal(terminal);

    // 4. Traces
    renderTraces(traces);

    if (isPreview) {
        notificationBanner.innerText = "PREVIEW MODE (Time Travel)";
        notificationBanner.classList.remove('hidden');
    } else {
        notificationBanner.classList.add('hidden');
    }
});

window.addEventListener('shell-error', (e) => {
    fatalBanner.innerText = e.detail;
    fatalBanner.classList.remove('hidden');
});

window.addEventListener('shell-notify', (e) => {
    showNotification(e.detail);
});

// --- RENDERERS ---

function renderRibbon(workspace, focusedId) {
    // Sync columns
    for (const [id, cm] of editors) {
        if (!workspace.find(w => w.id === id)) {
            document.getElementById(`col-${id}`)?.remove();
            editors.delete(id);
        }
    }

    workspace.forEach((ws) => {
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
                cm.on('change', (instance, change) => {
                    if (change.origin !== 'setValue') {
                        shell.updateEphemeralBuffer(ws.id, instance.getValue());
                    }
                });
                editors.set(ws.id, cm);
            } else if (ws.kind === 'inspector') {
                 // Static view, updated below
            }
        }

        col.classList.toggle('active', ws.id === focusedId);

        if (ws.kind === 'editor') {
            const cm = editors.get(ws.id);
            if (cm.getValue() !== ws.content && !cm.hasFocus()) {
                cm.setValue(ws.content);
            }
        } else if (ws.kind === 'inspector') {
            document.getElementById(`content-${ws.id}`).innerHTML = `<pre>${JSON.stringify(ws, null, 2)}</pre>`;
        }
    });

    // Camera movement (Geometry Invariant)
    const focusedIndex = workspace.findIndex(w => w.id === focusedId);
    if (focusedIndex !== -1) {
        const offset = focusedIndex * 80;
        ribbon.style.transform = `translateX(-${offset}vw)`;
    }
}

function renderDiagnostics(diagnostics) {
    diagnosticsContent.innerHTML = Object.entries(diagnostics).map(([k, v]) => `<div>${k}: ${v.length} issues</div>`).join('');
}

function renderTerminal(terminal) {
    outputContent.innerHTML = terminal.map(c => `<span>${c.text || ''}</span>`).join('');
}

function renderTraces(traces) {
    traceContent.innerHTML = '';
    traces.slice().reverse().forEach(t => {
        const div = document.createElement('div');
        div.className = 'trace-item';
        div.innerText = `ID: ${t.id} (MB: ${t.metaBufferId})`;
        div.onclick = () => window.timeTravel(t.id);
        traceContent.appendChild(div);
    });
}

window.timeTravel = (id) => shell.timeTravel(id);

// --- INPUT HANDLERS ---

btnAnalyze.onclick = () => shell.handleEvent(1, { pending_command: { type: 'ACTIVATE_BUFFER', bufferId: 3 } });
btnRun.onclick = () => shell.handleEvent(1, { pending_command: { type: 'ACTIVATE_RUN' } });

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey)) {
        if (e.key === 'ArrowRight') {
             shell.handleEvent(1, { type: 'COMMAND', pending_command: { type: 'FOCUS_NEXT' } }); // Logic to be handled in Root or Shell
        } else if (e.key === 'ArrowLeft') {
             shell.handleEvent(1, { type: 'COMMAND', pending_command: { type: 'FOCUS_PREV' } });
        } else if (e.key === 'n') {
            e.preventDefault();
            shell.handleEvent(1, { type: 'COMMAND', pending_command: { type: 'CREATE_BUFFER', kind: 'editor' } });
        }
    }
});

function showNotification(msg) {
    notificationBanner.innerText = msg;
    notificationBanner.classList.remove('hidden');
    setTimeout(() => notificationBanner.classList.add('hidden'), 3000);
}

// --- BOOT ---
window.onload = () => shell.boot();
