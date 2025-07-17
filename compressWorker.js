const { parentPort } = require('worker_threads');
const zlib = require('zlib');

parentPort?.on('message', async ({ logData }) => {
    try {
        const compressed = zlib.gzipSync(Buffer.isBuffer(logData) ? logData : Buffer.from(logData));
        parentPort?.postMessage({ success: true, compressed });
    } catch (error) {
        parentPort?.postMessage({ success: false, error: error.message });
    }
});