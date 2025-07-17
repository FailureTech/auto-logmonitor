const fs = require('fs-extra');
const path = require('path');

class ConfigLoader {
    constructor() {
        this.config = null;
        this.configPath = path.join(process.cwd(), 'config.json');
    }

    async load() {
        if (!await fs.pathExists(this.configPath)) {
            throw new Error('config.json not found in current directory');
        }

        try {
            this.config = await fs.readJson(this.configPath);
            return this.transformConfig();
        } catch (error) {
            throw new Error(`Error loading config.json: ${error.message}`);
        }
    }

    transformConfig() {
        // Get values from config.json with environment variable overrides
        const getValue = (configPath, envVar, defaultValue, transform = (v) => v) => {
            const configValue = this.getNestedValue(this.config, configPath);
            const envValue = process.env[envVar];
            
            // Environment variable takes precedence over config.json
            if (envValue !== undefined) {
                return transform(envValue);
            }
            
            // Fall back to config.json value
            if (configValue !== undefined) {
                return transform(configValue);
            }
            
            // Finally fall back to default
            return transform(defaultValue);
        };

        // Transform the config.json structure to match the expected CONFIG format
        const transformed = {
            // Source configuration
            command: getValue('source.command', 'COMMAND', ''),
            filename: getValue('source.file', 'FILENAME', null),
            follow: getValue('source.follow', 'FOLLOW', true, (v) => v === 'true' || v === true),
            fromBeginning: getValue('source.fromBeginning', 'FROM_BEGINNING', false, (v) => v === 'true' || v === true),

            // Filter patterns
            whatToSend: new RegExp(getValue('filters.sendPattern', 'WHAT_TO_SEND', 'ERROR|CRITICAL')),
            whatToAlert: new RegExp(getValue('filters.alertPattern', 'ALERT_REGEX', 'CRITICAL')),
            ignorePattern: getValue('filters.ignorePattern', 'IGNORE_PATTERN', null, (v) => v ? new RegExp(v) : null),

            // Output configuration
            apiEndpoint: getValue('output.apiEndpoint', 'API_ENDPOINT', ''),
            apiKey: getValue('output.apiKey', 'API_KEY', ''),
            batchSize: getValue('output.batchSize', 'BATCH_SIZE', 100, parseInt),
            batchTimeout: getValue('output.batchTimeout', 'BATCH_TIMEOUT', 5000, parseInt),

            // Performance settings
            maxChunkSizeBytes: getValue('performance.maxMemoryMB', 'CHUNK_SIZE_MB', 512, (v) => parseInt(v) * 1024 * 1024),
            maxQueueSize: getValue('performance.maxQueueSize', 'MAX_QUEUE_SIZE', 10000, parseInt),
            compression: getValue('performance.compression', 'COMPRESSION', true, (v) => v === 'true' || v === true),
            retryAttempts: getValue('performance.retryAttempts', 'RETRY_ATTEMPTS', 3, parseInt),
            retryDelay: getValue('performance.retryDelay', 'RETRY_DELAY', 1000, parseInt),

            // Queue settings
            queueDir: getValue('performance.queueDir', 'QUEUE_DIR', './log-disk-queue'),
            concurrency: getValue('performance.concurrency', 'CONCURRENCY', 10, parseInt),
            apiRateLimit: getValue('performance.apiRateLimit', 'API_RATE_LIMIT', 10, parseInt),
            batchMinutes: getValue('performance.batchMinutes', 'BATCH_MINUTES', 1, parseInt),

            // Kafka settings
            useKafka: getValue('kafka.enabled', 'USE_KAFKA', false, (v) => v === 'true' || v === true),
            kafkaBrokers: getValue('kafka.brokers', 'KAFKA_BROKERS', ['localhost:9092'], (v) => 
                Array.isArray(v) ? v : v.split(',').map(broker => broker.trim())
            ),
            kafkaTopic: getValue('kafka.topic', 'KAFKA_TOPIC', 'log-streams'),
            kafkaClientId: getValue('kafka.clientId', 'KAFKA_CLIENT_ID', 'auto-logmonitor'),
            kafkaMaxRetries: getValue('kafka.maxRetries', 'KAFKA_MAX_RETRIES', 5, parseInt),
            kafkaTimeout: getValue('kafka.timeout', 'KAFKA_TIMEOUT', 30000, parseInt),
            kafkaMaxPendingMessages: getValue('kafka.maxPendingMessages', 'KAFKA_MAX_PENDING_MESSAGES', 1000, parseInt),
            kafkaConsumerFilter: getValue('kafka.consumerFilter', 'KAFKA_CONSUMER_FILTER', null, (v) => v ? new RegExp(v) : null),

            // Logging settings
            logLevel: getValue('logging.level', 'LOG_LEVEL', 'info'),
            logFile: getValue('logging.file', 'LOG_FILE', 'auto-logmonitor.log'),
            logMaxSize: getValue('logging.maxSize', 'LOG_MAX_SIZE', '10MB'),
            logMaxFiles: getValue('logging.maxFiles', 'LOG_MAX_FILES', 5, parseInt),

            // SMTP alert settings
            smtpConfig: {
                host: getValue('smtp.host', 'SMTP_HOST', ''),
                port: getValue('smtp.port', 'SMTP_PORT', 587, parseInt),
                secure: getValue('smtp.secure', 'SMTP_SECURE', false, v => v === 'true' || v === true),
                user: getValue('smtp.user', 'SMTP_USER', ''),
                pass: getValue('smtp.pass', 'SMTP_PASS', ''),
                recipients: getValue('smtp.recipients', 'SMTP_RECIPIENTS', [], v => Array.isArray(v) ? v : v.split(',').map(e => e.trim()))
            }
        };

        return transformed;
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    getConfig() {
        return this.config;
    }
}

// For backward compatibility, export CONFIG that loads from config.json
let CONFIG = null;

async function loadConfig() {
    if (!CONFIG) {
        const loader = new ConfigLoader();
        CONFIG = await loader.load();
    }
    return CONFIG;
}

module.exports = { 
    CONFIG: null, // Will be populated when loadConfig() is called
    loadConfig,
    ConfigLoader 
};

// Auto-load config if this module is required
loadConfig().then(config => {
    module.exports.CONFIG = config;
}).catch(error => {
    console.error('Failed to load config:', error.message);
    process.exit(1);
}); 