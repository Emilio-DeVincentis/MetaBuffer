// @ts-check

/**
 * @typedef {'input' | 'render' | 'background'} TaskPriority
 */

/**
 * @typedef {Object} Task
 * @property {TaskPriority} priority
 * @property {() => void} run
 */

export class Scheduler {
    constructor() {
        /** @type {Task[]} */
        this.queue = [];
        this.isProcessing = false;
    }

    /**
     * @param {() => void} taskFn
     * @param {TaskPriority} priority
     */
    enqueue(taskFn, priority = 'background') {
        this.queue.push({ priority, run: taskFn });
        this.queue.sort((a, b) => this._priorityToValue(b.priority) - this._priorityToValue(a.priority));

        if (!this.isProcessing) {
            this._process();
        }
    }

    /**
     * @param {TaskPriority} p
     * @returns {number}
     */
    _priorityToValue(p) {
        switch (p) {
            case 'input': return 100;
            case 'render': return 50;
            case 'background': return 0;
            default: return 0;
        }
    }

    async _process() {
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                try {
                    // In a real Web Worker, we'd use performance.now() and deadlines
                    task.run();
                } catch (e) {
                    console.error('Task execution failed', e);
                }
            }
            // Yield to event loop if necessary
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        this.isProcessing = false;
    }
}
