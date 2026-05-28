import { createShell } from '../src/app/Shell.js';

const shell = createShell();

window.onload = async () => {
    if (typeof Neutralino !== 'undefined') {
        Neutralino.init();
    }
    await shell.boot();

    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) {
        saveBtn.onclick = () => shell.saveState();
    }

    const helpModal = document.getElementById('help-modal');
    const closeHelpBtn = document.getElementById('btn-close-help');
    if (closeHelpBtn && helpModal) {
        closeHelpBtn.onclick = () => helpModal.classList.add('hidden');
    }
};

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey)) {
        if (e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                shell.redo();
            } else {
                shell.undo();
            }
        } else if (e.key === 'y') {
            e.preventDefault();
            shell.redo();
        } else if (e.key === 'n') {
            e.preventDefault();
            shell.createBuffer();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            shell.focusNext();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            shell.focusPrev();
        } else if (e.key === '?' || e.key === '/') {
            e.preventDefault();
            const helpModal = document.getElementById('help-modal');
            if (helpModal) helpModal.classList.toggle('hidden');
        }
    }
});
