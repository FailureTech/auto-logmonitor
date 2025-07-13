const { parentPort } = require('worker_threads');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

parentPort?.on('message', async ({ logData, filePath }) => {
    try {
        const compressed = zlib.gzipSync(Buffer.from(logData));
        await fs.promises.writeFile(filePath, compressed);
        parentPort?.postMessage({ success: true, filePath });
    } catch (error) {
        parentPort?.postMessage({ success: false, error: error.message });
    }
});