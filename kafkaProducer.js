const { Kafka } = require('kafkajs');
const { loadConfig } = require('./config');
const { logSuccess, logFailure, logRetry, updateQueueSize } = require('./metrics');

class KafkaProducer {
    constructor() {
        this.config = null;
        this.kafka = null;
        this.producer = null;
        this.isConnected = false;
        this.pendingMessages = new Map();
        this.retryCounts = new Map();
        this.healthy = true;
        this.messageId = 0;
    }

    async initialize() {
        this.config = await loadConfig();
        
        this.kafka = new Kafka({
            clientId: this.config.kafkaClientId || 'auto-logmonitor',
            brokers: this.config.kafkaBrokers,
            retry: {
                initialRetryTime: 100,
                retries: 8
            },
            connectionTimeout: 3000,
            requestTimeout: 30000
        });

        this.producer = this.kafka.producer({
            allowAutoTopicCreation: true,
            transactionTimeout: 30000,
            maxInFlightRequests: 5,
            idempotent: true
        });

        try {
            await this.producer.connect();
            this.isConnected = true;
            console.log('[KAFKA] Producer connected successfully');
            this.startHealthMonitor();
        } catch (error) {
            console.error('[KAFKA] Failed to connect producer:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.isConnected) {
            try {
                await this.producer.disconnect();
                this.isConnected = false;
                console.log('[KAFKA] Producer disconnected');
            } catch (error) {
                console.error('[KAFKA] Error disconnecting producer:', error);
            }
        }
    }

    startHealthMonitor() {
        setInterval(() => {
            const wasHealthy = this.healthy;
            this.healthy = this.isConnected && this.pendingMessages.size < this.config.kafkaMaxPendingMessages;

            if (!wasHealthy && this.healthy) {
                console.log('[KAFKA] Health restored - resuming normal operations');
            } else if (wasHealthy && !this.healthy) {
                console.warn('[KAFKA] Health degraded - high pending messages or disconnected');
            }
        }, 5000);
    }

    async sendLogBatch(logData, metadata = {}) {
        if (!this.isConnected) {
            throw new Error('Kafka producer not connected');
        }

        if (!this.healthy) {
            throw new Error('Kafka producer unhealthy - not accepting new messages');
        }

        const messageId = ++this.messageId;
        const message = {
            id: messageId,
            timestamp: Date.now(),
            data: logData,
            metadata: {
                source: this.config.filename || 'unknown',
                batchSize: logData.length,
                ...metadata
            }
        };

        try {
            const result = await this.producer.send({
                topic: this.config.kafkaTopic,
                messages: [{
                    key: `log-${messageId}`,
                    value: JSON.stringify(message),
                    headers: {
                        'content-type': 'application/json',
                        'source': this.config.filename || 'unknown',
                        'batch-id': messageId.toString()
                    }
                }],
                timeout: this.config.kafkaTimeout || 30000
            });

            logSuccess();
            console.log(`[KAFKA] Successfully sent batch ${messageId} to partition ${result[0].partition}, offset ${result[0].baseOffset}`);
            
            return {
                success: true,
                messageId,
                partition: result[0].partition,
                offset: result[0].baseOffset
            };

        } catch (error) {
            logFailure();
            logRetry();

            const retries = (this.retryCounts.get(messageId) || 0) + 1;
            this.retryCounts.set(messageId, retries);

            console.error(`[KAFKA] Error sending batch ${messageId}:`, error.message);

            if (retries >= this.config.kafkaMaxRetries || 5) {
                console.error(`[KAFKA] Max retries reached for batch ${messageId}`);
                this.retryCounts.delete(messageId);
                return {
                    success: false,
                    messageId,
                    error: error.message,
                    retries
                };
            } else {
                // Retry with exponential backoff
                const retryDelay = Math.min(1000 * Math.pow(2, retries), 30000);
                console.log(`[KAFKA] Retrying batch ${messageId} in ${retryDelay}ms (attempt ${retries})`);
                
                setTimeout(async () => {
                    try {
                        await this.sendLogBatch(logData, metadata);
                    } catch (retryError) {
                        console.error(`[KAFKA] Retry failed for batch ${messageId}:`, retryError.message);
                    }
                }, retryDelay);

                return {
                    success: false,
                    messageId,
                    error: error.message,
                    retries,
                    retryScheduled: true
                };
            }
        }
    }

    async sendLogEntry(logEntry, metadata = {}) {
        return this.sendLogBatch([logEntry], metadata);
    }

    getStatus() {
        return {
            connected: this.isConnected,
            healthy: this.healthy,
            pendingMessages: this.pendingMessages.size,
            retryCounts: this.retryCounts.size,
            messageId: this.messageId
        };
    }
}

module.exports = KafkaProducer; 