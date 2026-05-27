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
        // Coalescing logic: if a render task is already in queue, don't add another one
        if (priority === 'render') {
            const hasRenderTask = this.queue.some(t => t.priority === 'render');
            if (hasRenderTask) return;
        }

        this.queue.push({ priority, run: taskFn });

        // Priority Sort: input > render > background
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
                    const start = performance.now();
                    task.run();
                    const duration = performance.now() - start;

                    // Respect the 4ms compute slice for background tasks
                    if (task.priority === 'background' && duration > 4) {
                        console.warn(`Background task budget exceeded: ${duration.toFixed(2)}ms`);
                    }
                } catch (e) {
                    console.error('Task execution failed', e);
                }
            }
            // Yield to event loop
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        this.isProcessing = false;
    }
}
