#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs-extra');
const path = require('path');
const { spawn, execSync } = require('child_process');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const KafkaProducer = require('./kafkaProducer');
const chokidar = require('chokidar');
const nodemailer = require('nodemailer');
const { loadConfig } = require('./config');
const { uploadQueue } = require('./queue');

class SimpleLogMonitor {
    constructor() {
        this.config = null;
        this.process = null;
        this.isRunning = false;
        this.logBuffer = [];
        this.lastBatchTime = Date.now();
        this.stats = {
            processed: 0,
            sent: 0,
            errors: 0,
            alerts: 0
        };
        this.kafkaStarted = false;
        // Pre-compiled regex patterns
        this.sendPatternRegex = null;
        this.alertPatternRegex = null;
        this.ignorePatternRegex = null;
        this.kafkaProducer = null;
        this.kafkaProducerInitialized = false;
        this.batchIntervalId = null; // To clear interval on stop
        this.fileWatcher = null; // To close watcher on stop
    }

    async loadConfig() {
        try {
            this.config = await loadConfig();
            this.compileRegexPatterns();
            console.log('✅ Configuration loaded successfully');
            // Debug print SMTP config
            if (this.config.smtpConfig) {
                console.log('🔎 Loaded SMTP config:', this.config.smtpConfig);
            } else if (this.config.smtp) {
                console.log('🔎 Loaded SMTP config:', this.config.smtp);
            } else {
                console.log('🔎 No SMTP config found in config.');
            }
        } catch (error) {
            console.error('❌ Error loading config:', error.message);
            process.exit(1);
        }
    }

    async createDefaultConfig(configPath) {
        const defaultConfig = {
            "server": {
                "port": 3000,
                "host": "localhost"
            },
            "source": {
                "type": "command",
                "command": "tail -f /var/log/app.log",
                "file": null,
                "follow": true,
                "fromBeginning": false
            },
            "filters": {
                "sendPattern": "ERROR|CRITICAL|WARN",
                "alertPattern": "CRITICAL|FATAL",
                "ignorePattern": ""
            },
            "output": {
                "type": "api",
                "apiEndpoint": "https://your-api.com/logs",
                "apiKey": "your-api-key",
                "batchSize": 100,
                "batchTimeout": 5000
            },
            "kafka": {
                "enabled": false,
                "brokers": ["localhost:9092"],
                "topic": "log-streams",
                "clientId": "auto-logmonitor"
            },
            "performance": {
                "maxMemoryMB": 512,
                "maxQueueSize": 10000,
                "compression": true,
                "retryAttempts": 3,
                "retryDelay": 1000
            },
            "logging": {
                "level": "info",
                "file": "auto-logmonitor.log",
                "maxSize": "10MB",
                "maxFiles": 5
            },
            "smtpConfig": {
                "host": "smtp.example.com",
                "port": 587,
                "secure": false,
                "user": "your-email@example.com",
                "pass": "your-password",
                "recipients": ["recipient1@example.com", "recipient2@example.com"]
            }
        };

        await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
    }

    compileRegexPatterns() {
        try {
            this.sendPatternRegex = this.config.whatToSend || null;
        } catch (e) {
            console.error('❌ Invalid sendPattern regex:', e.message);
            this.sendPatternRegex = null;
        }
        try {
            this.alertPatternRegex = this.config.whatToAlert || null;
        } catch (e) {
            console.error('❌ Invalid alertPattern regex:', e.message);
            this.alertPatternRegex = null;
        }
        try {
            this.ignorePatternRegex = this.config.ignorePattern || null;
        } catch (e) {
            console.error('❌ Invalid ignorePattern regex:', e.message);
            this.ignorePatternRegex = null;
        }
    }

    async ensureKafka() {
        if (!this.config.useKafka || !this.config.kafkaBrokers) return;
        // Check for Docker
        try {
            execSync('docker --version', { stdio: 'ignore' });
        } catch (e) {
            console.error('❌ Docker is required for Kafka mode but was not found.');
            console.error('👉 Please install Docker: https://docs.docker.com/get-docker/');
            process.exit(1);
        }
        // Check for docker-compose.yml
        const composePath = path.join(process.cwd(), 'docker-compose.yml');
        if (!await fs.pathExists(composePath)) {
            console.error('❌ docker-compose.yml not found. Kafka cannot be started.');
            process.exit(1);
        }
        // Start Kafka with docker-compose
        try {
            console.log('🐳 Starting Kafka with Docker Compose...');
            execSync('docker compose up -d', { cwd: process.cwd(), stdio: 'inherit' });
            this.kafkaStarted = true;
        } catch (e) {
            try {
                // fallback for older docker-compose
                execSync('docker-compose up -d', { cwd: process.cwd(), stdio: 'inherit' });
                this.kafkaStarted = true;
            } catch (err) {
                console.error('❌ Failed to start Kafka with Docker Compose.');
                process.exit(1);
            }
        }
        // Wait for Kafka to be ready
        await this.waitForKafka();
    }

    async waitForKafka() {
        const maxWait = 60; // seconds
        let waited = 0;
        const brokers = this.config.kafkaBrokers || ["localhost:9092"];
        const [host, port] = brokers[0].split(":");
        console.log(`⏳ Waiting for Kafka to be ready at ${host}:${port}...`);
        while (waited < maxWait) {
            try {
                await new Promise((resolve, reject) => {
                    const net = require('net');
                    const socket = net.createConnection({ host, port: parseInt(port) }, () => {
                        socket.end();
                        resolve();
                    });
                    socket.on('error', reject);
                    setTimeout(() => {
                        socket.destroy();
                        reject(new Error('timeout'));
                    }, 1000);
                });
                console.log('✅ Kafka is ready!');
                return;
            } catch (e) {
                await new Promise(r => setTimeout(r, 1000));
                waited++;
            }
        }
        console.error('❌ Kafka did not become ready in time.');
        process.exit(1);
    }

    async start() {
        if (this.isRunning) {
            console.log('⚠️  Monitor is already running');
            return;
        }

        // If Kafka is enabled, ensure it is running
        await this.ensureKafka();

        // Initialize KafkaProducer if needed
        if (this.config.useKafka && this.config.kafkaBrokers) {
            if (!this.kafkaProducer) {
                this.kafkaProducer = new KafkaProducer();
            }
            if (!this.kafkaProducerInitialized) {
                try {
                    await this.kafkaProducer.initialize();
                    this.kafkaProducerInitialized = true;
                } catch (err) {
                    console.error('❌ Failed to initialize KafkaProducer:', err.message);
                    process.exit(1);
                }
            }
        }

        console.log('🚀 Starting Auto Log Monitor...');
        console.log(`📊 Source: ${this.config.command ? 'command' : 'file'}`);
        console.log(`🎯 Output: ${this.config.apiEndpoint ? 'api' : (this.config.useKafka ? 'kafka' : 'unknown')}`);
        console.log(`🔧 Kafka: ${this.config.useKafka ? 'Enabled' : 'Disabled'}`);

        this.isRunning = true;

        // Start the source
        if (this.config.command) {
            await this.startCommandMonitor();
        } else if (this.config.filename) {
            await this.startFileMonitor();
        }

        // Start batch processing
        this.startBatchProcessor();
        console.log(`⏰ Batch processing interval: ${this.config.batchMinutes || 1} minute(s)`);

        // Start stats reporting
        this.startStatsReporter();

        console.log('✅ Monitor started successfully');
        console.log('📝 Press Ctrl+C to stop');
    }

    async startCommandMonitor() {
        const command = this.config.command;
        console.log(`🔄 Starting command: ${command}`);

        const [cmd, ...args] = command.split(' ');
        this.process = spawn(cmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });

        this.process.stdout.setEncoding('utf-8');
        this.process.stdout.on('data', (data) => {
            this.processLogData(data);
        });

        this.process.stderr.setEncoding('utf-8');
        this.process.stderr.on('data', (data) => {
            this.processLogData(data);
        });

        this.process.on('close', (code) => {
            console.log(`🔄 Command exited with code ${code}`);
            if (this.isRunning) {
                console.log('🔄 Restarting command in 5 seconds...');
                setTimeout(() => {
                    if (this.isRunning) {
                        this.startCommandMonitor();
                    }
                }, 5000);
            }
        });

        this.process.on('error', (error) => {
            console.error('❌ Command error:', error.message);
        });
    }

    async startFileMonitor() {
        const file = this.config.filename;
        const follow = this.config.follow;
        const fromBeginning = this.config.fromBeginning;
        
        if (!await fs.pathExists(file)) {
            console.error(`❌ File not found: ${file}`);
            return;
        }

        console.log(`📁 Monitoring file: ${file}`);

        if (fromBeginning) {
            const content = await fs.readFile(file, 'utf8');
            this.processLogData(content);
        }

        if (follow) {
            // Use chokidar for efficient native file watching
            this.startChokidarWatcher(file);
        }
    }

    startChokidarWatcher(filePath) {
        let lastSize = 0;
        // Initialize lastSize to current file size
        fs.stat(filePath).then(stats => { lastSize = stats.size; });
        const watcher = chokidar.watch(filePath, { persistent: true, usePolling: false });
        watcher.on('change', async (changedPath) => {
            try {
                const stats = await fs.stat(changedPath);
                if (stats.size > lastSize) {
                    const stream = fs.createReadStream(changedPath, {
                        start: lastSize,
                        end: stats.size - 1,
                        encoding: 'utf8'
                    });
                    let buffer = '';
                    stream.on('data', (chunk) => { buffer += chunk; });
                    stream.on('end', () => {
                        this.processLogData(buffer);
                        lastSize = stats.size;
                    });
                }
            } catch (error) {
                console.error('❌ File watch error:', error.message);
            }
        });
        watcher.on('error', (error) => {
            console.error('❌ Chokidar error:', error.message);
        });
        this.fileWatcher = watcher;
    }

    processLogData(data) {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;
            this.stats.processed++;
            if (this.ignorePatternRegex && this.ignorePatternRegex.test(cleanLine)) {
                continue;
            }
            if (this.alertPatternRegex && this.alertPatternRegex.test(cleanLine)) {
                console.log('\x1b[31m%s\x1b[0m', `🚨 ALERT: ${cleanLine}`);
                this.stats.alerts++;
                this.sendAlertEmail(cleanLine);
            }
            if (this.sendPatternRegex && this.sendPatternRegex.test(cleanLine)) {
                this.logBuffer.push({
                    id: uuidv4(),
                    timestamp: new Date().toISOString(),
                    message: cleanLine,
                    source: this.config.command ? this.config.command : this.config.filename
                });
                // Flush if buffer is full
                if (this.logBuffer.length >= this.config.batchSize) {
                    this.flushBatch();
                }
            }
        }
    }

    async sendAlertEmail(alertMessage) {
        const smtp = this.config.smtpConfig;
        if (!smtp || !smtp.host || !smtp.user || !smtp.pass || !smtp.recipients || smtp.recipients.length === 0) {
            console.warn('SMTP config incomplete, cannot send alert email.');
            return;
        }
        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: {
                user: smtp.user,
                pass: smtp.pass
            }
        });
        const html = `
            <div style="font-family:Arial,sans-serif;padding:20px;background:#f9f9f9;">
                <h2 style="color:#d32f2f;">🚨 Log Alert Triggered</h2>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Alert Message:</strong></p>
                <pre style="background:#fff3e0;padding:10px;border-radius:5px;color:#d32f2f;">${alertMessage}</pre>
                <hr/>
                <p style="font-size:12px;color:#888;">Auto LogMonitor</p>
            </div>
        `;
        try {
            await transporter.sendMail({
                from: `LogMonitor Alert <${smtp.user}>`,
                to: smtp.recipients.join(','),
                subject: '🚨 Log Alert Triggered',
                html
            });
            console.log('📧 Alert email sent.');
        } catch (err) {
            console.error('❌ Failed to send alert email:', err.message);
        }
    }

    startBatchProcessor() {
        // Use batchMinutes from config, default to 1 minute
        const batchInterval = (this.config.batchMinutes || 1) * 60 * 1000;
        this.batchIntervalId = setInterval(async () => {
            if (this.logBuffer.length > 0) {
                await this.flushBatch();
            }
            // Process pending retries from the queue
            await require('./queue').uploadQueue.processPendingRetries();
            this.printBatchMetrics();
        }, batchInterval);
    }

    async flushBatch() {
        if (this.logBuffer.length === 0) return;
        const batch = [...this.logBuffer];
        this.logBuffer.length = 0;
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        try {
            let filePath;
            if (this.config.compression) {
                // Compress before writing to disk
                const compressed = await new Promise((resolve, reject) => {
                    const worker = new (require('worker_threads').Worker)(require('path').join(__dirname, 'compressWorker.js'));
                    worker.postMessage({ logData: JSON.stringify(batch) });
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
                filePath = require('path').join(this.config.queueDir, fileName + '.json.gz');
                await require('fs-extra').writeFile(filePath, compressed);
            } else {
                filePath = require('path').join(this.config.queueDir, fileName + '.json');
                await require('fs-extra').writeFile(filePath, JSON.stringify(batch));
            }
            await require('./queue').uploadQueue.push(filePath);
            this.stats.sent += batch.length;
        } catch (err) {
            this.stats.errors++;
            console.error('❌ Error writing batch to disk:', err.message);
        }
    }

    async sendBatch() {
        if (this.logBuffer.length === 0) return;
        const batch = [...this.logBuffer];
        // Clear logBuffer references for memory management
        this.logBuffer.length = 0;
        try {
            if (this.config.apiEndpoint) {
                await this.sendToApi(batch);
            } else if (this.config.useKafka && this.config.kafkaBrokers) {
                await this.sendToKafka(batch);
            }
            this.stats.sent += batch.length;
            console.log(`📤 Sent batch of ${batch.length} logs`);
            // Print metrics when batch is sent
            this.printBatchMetrics();
        } catch (error) {
            this.stats.errors++;
            console.error('❌ Error sending batch:', error.message);
            // Retry logic
            if (this.config.retryAttempts > 0) {
                setTimeout(() => {
                    // Only requeue if buffer is not already too large
                    if (this.logBuffer.length < this.config.maxQueueSize) {
                        this.logBuffer.unshift(...batch);
                    } else {
                        console.error('❌ Dropping batch due to persistent memory pressure.');
                    }
                }, this.config.retryDelay);
            }
        }
    }

    async sendToApi(batch) {
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'AutoLogMonitor/1.0'
        };

        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        await axios.post(this.config.apiEndpoint, {
            logs: batch,
            metadata: {
                timestamp: new Date().toISOString(),
                batchSize: batch.length,
                source: this.config.command ? 'command' : 'file'
            }
        }, {
            headers,
            timeout: 10000
        });
    }

    async sendToKafka(batch) {
        if (!this.kafkaProducerInitialized) {
            console.error('❌ KafkaProducer not initialized. Cannot send batch.');
            return;
        }
        try {
            const result = await this.kafkaProducer.sendLogBatch(batch);
            if (result.success) {
                console.log(`✅ Kafka: Sent batch ${result.messageId} to partition ${result.partition}, offset ${result.offset}`);
            } else {
                console.error(`❌ Kafka: Failed to send batch ${result.messageId}: ${result.error}`);
            }
        } catch (err) {
            this.stats.errors++;
            console.error('❌ Error sending batch to Kafka:', err.message);
        }
    }

    async printBatchMetrics() {
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        // Get queue stats
        let queueStats = { healthy: true, active: 0, inProgress: 0, waitingRetry: 0, retryItems: [], rateLimit: '', concurrency: 0 };
        let queueFiles = 0;
        try {
            queueStats = require('./queue').uploadQueue.getStatus();
            const fs = require('fs');
            const path = require('path');
            const files = fs.readdirSync(this.config.queueDir).filter(f => !f.startsWith('dead-letter'));
            queueFiles = files.length;
        } catch (e) {}
        console.log(`\n📊 METRICS ${new Date().toISOString()}:
├── Processed: ${this.stats.processed} logs 📝
├── Sent: ${this.stats.sent} logs 📤
├── Errors: ${this.stats.errors} ❌
├── Alerts: ${this.stats.alerts} 🚨
├── Queue: ${queueFiles} files on disk, ${queueStats.active} active, ${queueStats.inProgress} in progress, ${queueStats.waitingRetry} waiting retry
├── Retries: ${queueStats.retryItems.map(r => `${r.file}:${r.retries}`).join(', ') || '0'}
├── Buffer: ${this.logBuffer.length} pending 🧵
├── Memory: ${memoryMB}MB 📈
`);
    }

    startStatsReporter() {
        setInterval(() => {
            const memoryUsage = process.memoryUsage();
            const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            
            // Memory check only - no stats printing
            if (memoryMB > this.config.maxMemoryMB) {
                console.warn(`⚠️  High memory usage: ${memoryMB}MB`);
                this.logBuffer = this.logBuffer.slice(-this.config.batchSize);
            }
        }, 30000);
    }

    async stop() {
        console.log('\n🛑 Stopping monitor...');
        
        this.isRunning = false;
        
        if (this.process) {
            this.process.kill();
            this.process = null;
        }

        // Stop file watcher if running
        if (this.fileWatcher) {
            try {
                await this.fileWatcher.close();
            } catch (err) {
                console.error('⚠️  Error closing file watcher:', err.message);
            }
            this.fileWatcher = null;
        }
        // Send remaining logs
        if (this.logBuffer.length > 0) {
            try {
            await this.sendBatch();
            } catch (err) {
                this.stats.errors++;
                console.error('❌ Error sending remaining batch:', err.message);
            }
        }

        // Clear batch interval
        if (this.batchIntervalId) clearInterval(this.batchIntervalId);

        // Flush remaining logs
        await this.flushBatch();

        // Shutdown KafkaProducer if initialized
        if (this.kafkaProducerInitialized && this.kafkaProducer) {
            try {
                await this.kafkaProducer.disconnect();
                this.kafkaProducerInitialized = false;
            } catch (err) {
                console.error('⚠️  Error disconnecting KafkaProducer:', err.message);
            }
        }
        // Optionally stop Kafka
        if (this.kafkaStarted) {
            try {
                console.log('🛑 Stopping Kafka (docker-compose down)...');
                execSync('docker compose down', { cwd: process.cwd(), stdio: 'inherit' });
            } catch (e) {
                try {
                    execSync('docker-compose down', { cwd: process.cwd(), stdio: 'inherit' });
                } catch (err) {
                    console.error('⚠️  Failed to stop Kafka. You may need to run docker-compose down manually.');
                }
            }
        }

        console.log('✅ Monitor stopped');
        console.log(`📊 Final stats: Processed=${this.stats.processed}, Sent=${this.stats.sent}, Errors=${this.stats.errors}, Alerts=${this.stats.alerts}`);
    }
}

// CLI entry point
async function main() {
    const monitor = new SimpleLogMonitor();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        await monitor.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await monitor.stop();
        process.exit(0);
    });

    try {
        await monitor.loadConfig();
        await monitor.start();
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
} 