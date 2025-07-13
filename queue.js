const { default: PQueue } = require('p-queue');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { loadConfig } = require('./config');
const { logSuccess, logFailure, logRetry, updateQueueSize } = require('./metrics');

class DiskPersistedQueue {
    constructor() {
        this.config = null;
        this.queue = null;
        this.pendingRetries = new Set();
        this.retryCounts = new Map();
        this.healthy = true;
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

    async processTask(filePath) {
        try {
            this.pendingRetries.add(filePath);
            updateQueueSize(this.length());

            const fileData = await fs.readFile(filePath);
            const fileSizeMB = (fileData.length / 1024 / 1024).toFixed(2);

            console.log(`[QUEUE] Sending ${fileSizeMB}MB file: ${path.basename(filePath)}`);

            await axios.post(this.config.apiEndpoint, fileData, {
                headers: {
                    'Content-Encoding': 'gzip',
                    'Content-Type': 'application/octet-stream'
                },
                timeout: 5000
            });

            logSuccess();
            await fs.unlink(filePath);
            this.retryCounts.delete(filePath);
            console.log(`[QUEUE] Success: ${path.basename(filePath)}`);
        } catch (err) {
            logFailure();
            logRetry();

            const retries = (this.retryCounts.get(filePath) || 0) + 1;
            this.retryCounts.set(filePath, retries);

            const isConnectionError = [
                'ECONNREFUSED', 'ETIMEDOUT',
                'ENETUNREACH', 'ECONNRESET'
            ].includes(err.code);

            const retryAfter = isConnectionError
                ? 30000 // 30s for connection issues
                : Math.min(1000 * Math.pow(2, retries), 30000);

            console.error(
                `[QUEUE] Error (${err.code || err.response?.status || 'unknown'}):`,
                `${path.basename(filePath)} -`,
                `Attempt ${retries}/${this.config.retryAttempts || 5},`,
                `Next try in ${retryAfter/1000}s`
            );

            if (retries >= (this.config.retryAttempts || 5)) {
                console.error(`[QUEUE] Max retries reached for ${path.basename(filePath)} - moving to DLQ`);
                const dlqPath = path.join(
                    this.config.queueDir,
                    'dead-letter',
                    `${Date.now()}_${path.basename(filePath)}`
                );
                await fs.move(filePath, dlqPath);
                this.retryCounts.delete(filePath);
            } else {
                setTimeout(() => {
                    this.queue.add(() => this.processTask(filePath));
                }, retryAfter);
            }
        } finally {
            this.pendingRetries.delete(filePath);
            updateQueueSize(this.length());
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
            waitingRetry: this.pendingRetries.size,
            retryItems: Array.from(this.pendingRetries).map(f => ({
                file: path.basename(f),
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