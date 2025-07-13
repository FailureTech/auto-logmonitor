#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { spawn, execSync } = require('child_process');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

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
    }

    async loadConfig() {
        const configPath = path.join(process.cwd(), 'config.json');
        
        if (!await fs.pathExists(configPath)) {
            console.error('❌ config.json not found in current directory');
            console.log('📝 Creating default config.json...');
            await this.createDefaultConfig(configPath);
            console.log('✅ Default config created. Please edit config.json and run again.');
            process.exit(1);
        }

        try {
            this.config = await fs.readJson(configPath);
            console.log('✅ Configuration loaded successfully');
        } catch (error) {
            console.error('❌ Error loading config.json:', error.message);
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
            }
        };

        await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
    }

    async ensureKafka() {
        if (!this.config.kafka || !this.config.kafka.enabled) return;
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
        const brokers = this.config.kafka.brokers || ["localhost:9092"];
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

        console.log('🚀 Starting Auto Log Monitor...');
        console.log(`📊 Source: ${this.config.source.type}`);
        console.log(`🎯 Output: ${this.config.output.type}`);
        console.log(`🔧 Kafka: ${this.config.kafka.enabled ? 'Enabled' : 'Disabled'}`);

        this.isRunning = true;

        // Start the source
        if (this.config.source.type === 'command') {
            await this.startCommandMonitor();
        } else if (this.config.source.type === 'file') {
            await this.startFileMonitor();
        }

        // Start batch processing
        this.startBatchProcessor();
        console.log(`⏰ Batch processing interval: ${this.config.performance?.batchMinutes || 1} minute(s)`);

        // Start stats reporting
        this.startStatsReporter();

        console.log('✅ Monitor started successfully');
        console.log('📝 Press Ctrl+C to stop');
    }

    async startCommandMonitor() {
        const { command } = this.config.source;
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
        const { file, follow, fromBeginning } = this.config.source;
        
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
            // Simple file watching using polling for better compatibility
            this.startFileWatcher(file);
        }
    }

    startFileWatcher(filePath) {
        let lastSize = 0;
        
        setInterval(async () => {
            try {
                const stats = await fs.stat(filePath);
                if (stats.size > lastSize) {
                    const stream = fs.createReadStream(filePath, {
                        start: lastSize,
                        end: stats.size - 1,
                        encoding: 'utf8'
                    });

                    let buffer = '';
                    stream.on('data', (chunk) => {
                        buffer += chunk;
                    });

                    stream.on('end', () => {
                        this.processLogData(buffer);
                        lastSize = stats.size;
                    });
                }
            } catch (error) {
                console.error('❌ File watch error:', error.message);
            }
        }, 1000);
    }

    processLogData(data) {
        const lines = data.toString().split('\n');
        
        for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;

            this.stats.processed++;

            // Check ignore pattern
            if (this.config.filters.ignorePattern && 
                new RegExp(this.config.filters.ignorePattern).test(cleanLine)) {
                continue;
            }

            // Check alert pattern
            if (this.config.filters.alertPattern && 
                new RegExp(this.config.filters.alertPattern).test(cleanLine)) {
                console.log('\x1b[31m%s\x1b[0m', `🚨 ALERT: ${cleanLine}`);
                this.stats.alerts++;
            }

            // Check send pattern
            if (this.config.filters.sendPattern && 
                new RegExp(this.config.filters.sendPattern).test(cleanLine)) {
                
                this.logBuffer.push({
                    id: uuidv4(),
                    timestamp: new Date().toISOString(),
                    message: cleanLine,
                    source: this.config.source.type === 'command' ? 
                        this.config.source.command : this.config.source.file
                });

                // Check if buffer is full
                if (this.logBuffer.length >= this.config.output.batchSize) {
                    this.sendBatch();
                }
            }
        }
    }

    startBatchProcessor() {
        // Use batchMinutes from performance config, convert to milliseconds
        const batchInterval = (this.config.performance?.batchMinutes || 1) * 60 * 1000;
        
        setInterval(() => {
            if (this.logBuffer.length > 0) {
                this.sendBatch();
            }
        }, batchInterval);
    }

    async sendBatch() {
        if (this.logBuffer.length === 0) return;

        const batch = [...this.logBuffer];
        this.logBuffer = [];

        try {
            if (this.config.output.type === 'api') {
                await this.sendToApi(batch);
            } else if (this.config.output.type === 'kafka' && this.config.kafka.enabled) {
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
            if (this.config.performance.retryAttempts > 0) {
                setTimeout(() => {
                    this.logBuffer.unshift(...batch);
                }, this.config.performance.retryDelay);
            }
        }
    }

    async sendToApi(batch) {
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'AutoLogMonitor/1.0'
        };

        if (this.config.output.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.output.apiKey}`;
        }

        await axios.post(this.config.output.apiEndpoint, {
            logs: batch,
            metadata: {
                timestamp: new Date().toISOString(),
                batchSize: batch.length,
                source: this.config.source.type
            }
        }, {
            headers,
            timeout: 10000
        });
    }

    async sendToKafka(batch) {
        // Simple Kafka implementation without external dependencies
        // This would require kafkajs to be bundled or use a different approach
        console.log('⚠️  Kafka output not implemented in simple mode');
    }

    printBatchMetrics() {
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const uptime = process.uptime();
        const uptimeStr = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`;
        
        console.log(`
📊 BATCH METRICS ${new Date().toISOString()}:
├── Processed: ${this.stats.processed} logs 📝
├── Sent: ${this.stats.sent} logs 📤
├── Errors: ${this.stats.errors} ❌
├── Alerts: ${this.stats.alerts} 🚨
├── Buffer: ${this.logBuffer.length} pending 🧵
├── Memory: ${memoryMB}MB 📈
└── Uptime: ${uptimeStr} ⏳
`);
    }

    startStatsReporter() {
        setInterval(() => {
            const memoryUsage = process.memoryUsage();
            const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            
            // Memory check only - no stats printing
            if (memoryMB > this.config.performance.maxMemoryMB) {
                console.warn(`⚠️  High memory usage: ${memoryMB}MB`);
                this.logBuffer = this.logBuffer.slice(-this.config.output.batchSize);
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

        // Send remaining logs
        if (this.logBuffer.length > 0) {
            await this.sendBatch();
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