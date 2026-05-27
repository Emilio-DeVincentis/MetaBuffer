import { createShell } from '../src/app/Shell.js';

const shell = createShell();

window.onload = async () => {
    if (typeof Neutralino !== 'undefined') {
        Neutralino.init();
    }
    await shell.boot();
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
        }
    }
});
