import { MetaBufferRuntime } from './src/core/MetaBufferRuntime.js';
import { editorBuffer } from './src/buffers/editor.js';

const runtime = new MetaBufferRuntime();
runtime.registerBuffer(editorBuffer);
runtime.setContext({ js_source_code: '', incoming_input: 'a' });

console.log('Dispatch 1');
runtime.dispatch(2);
console.log('Context after 1:', JSON.stringify(runtime.getContext()));

runtime.setContext({ ...runtime.getContext(), incoming_input: 'b' });
console.log('Dispatch 2');
runtime.dispatch(2);
console.log('Context after 2:', JSON.stringify(runtime.getContext()));
