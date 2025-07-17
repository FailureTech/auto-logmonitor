const { default: PQueue } = require('p-queue');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { loadConfig } = require('./config');
const { logSuccess, logFailure, logRetry, updateQueueSize } = require('./metrics');
const { Worker } = require('worker_threads');

class DiskPersistedQueue {
    constructor() {
        this.config = null;
        this.queue = null;
        this.pendingRetries = new Set();
        this.retryCounts = new Map();
        this.healthy = true;
        this.pendingRetryFiles = new Set();
    }

    async initialize() {
        this.config = await loadConfig();
        
        this.queue = new PQueue({
            concurrency: this.config.concurrency,
            intervalCap: this.config.apiRateLimit,
            interval: 1000
        });
        this.pendingRetries = new Set();
        this.retryCounts = new Map();
        this.healthy = true;
        this.startHealthMonitor();
    }

    async setupDirectories() {
        await fs.ensureDir(this.config.queueDir);
        await fs.ensureDir(path.join(this.config.queueDir, 'dead-letter'));
        await this.cleanupOldFiles();
        console.log('[QUEUE] Initialized with:', {
            concurrency: this.config.concurrency,
            rateLimit: `${this.config.apiRateLimit}/sec`,
            maxQueueSize: this.config.maxQueueSize,
            queueDir: this.config.queueDir
        });
    }

    async cleanupOldFiles() {
        try {
            const now = Date.now();
            let deleted = 0;

            // Clean main queue files
            const files = await fs.readdir(this.config.queueDir);
            for (const file of files) {
                if (file.endsWith('.gz')) {
                    const filePath = path.join(this.config.queueDir, file);
                    const stat = await fs.stat(filePath);
                    if (now - stat.mtimeMs > 7 * 86400000) {
                        await fs.unlink(filePath);
                        deleted++;
                    }
                }
            }

            // Clean dead letter queue
            const dlqFiles = await fs.readdir(path.join(this.config.queueDir, 'dead-letter'));
            for (const file of dlqFiles) {
                const filePath = path.join(this.config.queueDir, 'dead-letter', file);
                const stat = await fs.stat(filePath);
                if (now - stat.mtimeMs > 7 * 86400000) {
                    await fs.unlink(filePath);
                    deleted++;
                }
            }

            if (deleted > 0) {
                console.log(`[QUEUE] Cleaned up ${deleted} old files`);
            }
        } catch (err) {
            console.error('[QUEUE] Cleanup error:', err);
        }
    }

    startHealthMonitor() {
        setInterval(() => {
            const wasHealthy = this.healthy;
            this.healthy = this.queue.pending < this.config.concurrency * 2;

            if (!wasHealthy && this.healthy) {
                console.log('[QUEUE] Health restored - resuming normal operations');
            } else if (wasHealthy && !this.healthy) {
                console.warn('[QUEUE] Health degraded - high pending tasks');
            }
        }, 5000);
    }

    async enqueueBatch(batchData, fileName) {
        // fileName should be unique, e.g. `${Date.now()}_batch.json` or similar
        if (this.config.compression && !fileName.endsWith('.gz')) {
            fileName += '.gz';
        }
        const filePath = path.join(this.config.queueDir, fileName);
        if (this.config.compression) {
            // Compress before writing to disk
            const compressed = await new Promise((resolve, reject) => {
                const worker = new Worker(path.join(__dirname, 'compressWorker.js'));
                worker.postMessage({ logData: batchData });
                worker.on('message', (msg) => {
                    if (msg.success && msg.compressed) {
                        resolve(Buffer.from(msg.compressed));
                    } else {
                        reject(new Error(msg.error || 'Compression failed'));
                    }
                    worker.terminate();
                });
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
                });
            });
            await fs.writeFile(filePath, compressed);
            return filePath;
        } else {
            await fs.writeFile(filePath, batchData);
            return filePath;
        }
    }

    async processTask(filePath) {
        try {
            this.pendingRetries.add(filePath);
            updateQueueSize(this.length());

            let sendData;
            let sendHeaders = {
                'Content-Type': 'application/json',
                'timeout': this.config.timeout || 5000
            };

            if (filePath.endsWith('.json.gz')) {
                // Decompress before sending
                const compressed = await fs.readFile(filePath);
                sendData = require('zlib').gunzipSync(compressed);
                sendHeaders['Content-Encoding'] = 'identity';
            } else if (filePath.endsWith('.json')) {
                sendData = await fs.readFile(filePath);
                sendHeaders['Content-Encoding'] = 'identity';
            } else {
                console.warn(`[QUEUE] Skipping unknown file type: ${filePath}`);
                await fs.unlink(filePath);
                return;
            }

            console.log(`[QUEUE] Sending file: ${filePath}, decompressed: ${filePath.endsWith('.json.gz')}`);

            await axios.post(this.config.apiEndpoint, sendData, {
                headers: sendHeaders,
                timeout: this.config.timeout || 5000
            });

            logSuccess();
            await fs.unlink(filePath);
            this.retryCounts.delete(filePath);
            this.pendingRetryFiles.delete(filePath);
        } catch (err) {
            logFailure();
            this.retryCounts.set(filePath, (this.retryCounts.get(filePath) || 0) + 1);
            if (this.retryCounts.get(filePath) < this.config.retryAttempts) {
                // Add to pendingRetryFiles for next batch
                this.pendingRetryFiles.add(filePath);
                console.warn(`[QUEUE] Will retry file on next batch: ${filePath}`);
            } else {
                // Move to dead-letter queue
                const fs = require('fs-extra');
                const path = require('path');
                const dlqDir = path.join(this.config.queueDir, 'dead-letter');
                await fs.ensureDir(dlqDir);
                const dlqPath = path.join(dlqDir, path.basename(filePath));
                await fs.move(filePath, dlqPath, { overwrite: true });
                console.error(`[QUEUE] Moved file to dead-letter queue after ${this.config.retryAttempts} attempts: ${dlqPath}`);
                this.retryCounts.delete(filePath);
                this.pendingRetryFiles.delete(filePath);
            }
        } finally {
            this.pendingRetries.delete(filePath);
            updateQueueSize(this.length());
        }
    }

    async processPendingRetries() {
        // Retry all files in pendingRetryFiles
        const files = Array.from(this.pendingRetryFiles);
        for (const file of files) {
            await this.processTask(file);
        }
    }

    async push(filePath) {
        if (!this.healthy) {
            throw new Error('Queue unhealthy - not accepting new tasks');
        }

        if (this.length() >= this.config.maxQueueSize) {
            throw new Error(`Queue full (${this.length()}/${this.config.maxQueueSize})`);
        }

        try {
            await this.queue.add(() => this.processTask(filePath));
            updateQueueSize(this.length());
        } catch (err) {
            console.error('[QUEUE] Failed to enqueue task:', err);
            throw err;
        }
    }

    length() {
        return this.queue.size + this.queue.pending + this.pendingRetries.size;
    }

    getStatus() {
        return {
            healthy: this.healthy,
            active: this.queue.size,
            inProgress: this.queue.pending,
            waitingRetry: this.pendingRetryFiles.size,
            retryItems: Array.from(this.pendingRetries).map(f => ({
                file: require('path').basename(f),
                retries: this.retryCounts.get(f) || 0
            })),
            rateLimit: `${this.config.apiRateLimit}/sec`,
            concurrency: this.config.concurrency
        };
    }
}

const uploadQueue = new DiskPersistedQueue();

// Initialize the queue
uploadQueue.initialize().then(() => {
    uploadQueue.setupDirectories();
}).catch(error => {
    console.error('Failed to initialize queue:', error);
    process.exit(1);
});

// Enhanced monitoring
setInterval(() => {
    updateQueueSize(uploadQueue.length());
    const status = uploadQueue.getStatus();

    if (!status.healthy) {
        console.warn(`[QUEUE] Unhealthy - Pending: ${status.inProgress}, Retrying: ${status.waitingRetry}`);
    }

    if (uploadQueue.length() >= uploadQueue.config.maxQueueSize * 0.8) {
        console.warn(`[QUEUE] Approaching capacity: ${uploadQueue.length()}/${uploadQueue.config.maxQueueSize}`);
    }
}, 10000);

// Graceful shutdown
['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, async () => {
        console.log(`[QUEUE] Received ${signal} - Draining queue...`);
        await uploadQueue.queue.onIdle();
        console.log('[QUEUE] Shutdown complete');
        process.exit(0);
    });
});

module.exports = { uploadQueue };