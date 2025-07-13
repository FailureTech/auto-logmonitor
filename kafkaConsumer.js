const { Kafka } = require('kafkajs');
const { loadConfig } = require('./config');
const axios = require('axios');

class KafkaConsumer {
    constructor(groupId = 'auto-logmonitor-consumer') {
        this.config = null;
        this.kafka = null;
        this.consumer = null;
        this.groupId = groupId;
        this.isRunning = false;
        this.processedMessages = 0;
        this.failedMessages = 0;
        this.lastProcessedOffset = new Map();
    }

    async initialize() {
        this.config = await loadConfig();
        
        this.kafka = new Kafka({
            clientId: 'auto-logmonitor-consumer',
            brokers: this.config.kafkaBrokers,
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        });

        this.consumer = this.kafka.consumer({
            groupId: this.groupId,
            sessionTimeout: 30000,
            heartbeatInterval: 3000,
            maxBytesPerPartition: 1048576, // 1MB
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        });

        try {
            await this.consumer.connect();
            await this.consumer.subscribe({
                topic: this.config.kafkaTopic,
                fromBeginning: false
            });
            
            console.log('[KAFKA-CONSUMER] Consumer initialized successfully');
            this.startMetricsReporting();
        } catch (error) {
            console.error('[KAFKA-CONSUMER] Failed to initialize consumer:', error);
            throw error;
        }
    }

    async start() {
        if (this.isRunning) {
            console.warn('[KAFKA-CONSUMER] Consumer is already running');
            return;
        }

        try {
            await this.consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    await this.processMessage(topic, partition, message);
                },
                autoCommit: true,
                autoCommitInterval: 5000,
                autoCommitThreshold: 100
            });

            this.isRunning = true;
            console.log('[KAFKA-CONSUMER] Consumer started successfully');
        } catch (error) {
            console.error('[KAFKA-CONSUMER] Failed to start consumer:', error);
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) return;

        try {
            await this.consumer.disconnect();
            this.isRunning = false;
            console.log('[KAFKA-CONSUMER] Consumer stopped');
        } catch (error) {
            console.error('[KAFKA-CONSUMER] Error stopping consumer:', error);
        }
    }

    async processMessage(topic, partition, message) {
        try {
            const messageValue = JSON.parse(message.value.toString());
            const { data, metadata } = messageValue;

            console.log(`[KAFKA-CONSUMER] Processing message ${messageValue.id} from partition ${partition}, offset ${message.offset}`);

            // Process each log entry in the batch
            for (const logEntry of data) {
                await this.processLogEntry(logEntry, metadata);
            }

            this.processedMessages++;
            this.lastProcessedOffset.set(partition, message.offset);

        } catch (error) {
            this.failedMessages++;
            console.error('[KAFKA-CONSUMER] Error processing message:', error);
            
            // Log the failed message for debugging
            console.error('[KAFKA-CONSUMER] Failed message content:', message.value.toString());
        }
    }

    async processLogEntry(logEntry, metadata) {
        try {
            // Apply any additional filtering or transformation
            if (this.config.kafkaConsumerFilter && !this.config.kafkaConsumerFilter.test(logEntry)) {
                return; // Skip this entry
            }

            // Send to API endpoint if configured
            if (this.config.apiEndpoint) {
                await this.sendToApi(logEntry, metadata);
            }

            // Apply alerting logic
            if (this.config.whatToAlert.test(logEntry)) {
                console.log('\x1b[31m%s\x1b[0m', `[ALERT] ${logEntry}`);
            }

        } catch (error) {
            console.error('[KAFKA-CONSUMER] Error processing log entry:', error);
        }
    }

    async sendToApi(logEntry, metadata) {
        try {
            const payload = {
                logEntry,
                metadata: {
                    ...metadata,
                    processedAt: new Date().toISOString(),
                    consumerId: this.consumer.groupId
                }
            };

            await axios.post(this.config.apiEndpoint, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': 'kafka-consumer'
                },
                timeout: 5000
            });

        } catch (error) {
            console.error('[KAFKA-CONSUMER] Failed to send to API:', error.message);
            throw error;
        }
    }

    startMetricsReporting() {
        setInterval(() => {
            const status = this.getStatus();
            console.log('[KAFKA-CONSUMER] Status:', status);
        }, 30000); // Report every 30 seconds
    }

    getStatus() {
        return {
            running: this.isRunning,
            processedMessages: this.processedMessages,
            failedMessages: this.failedMessages,
            successRate: this.processedMessages > 0 
                ? ((this.processedMessages - this.failedMessages) / this.processedMessages * 100).toFixed(2) + '%'
                : '0%',
            lastProcessedOffsets: Object.fromEntries(this.lastProcessedOffset)
        };
    }
}

module.exports = KafkaConsumer; 