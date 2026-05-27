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
            shell.undo();
        }
    }
});
