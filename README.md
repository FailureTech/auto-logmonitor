# Auto Log Monitor - Simple CLI Tool

A powerful, lightweight CLI tool for monitoring logs and sending them to your API or Kafka. Perfect for production environments with high-volume log processing.

## 🚀 Quick Start

### 1. Install
```bash
npm install -g auto-logmonitor
```

### 2. Run (creates config automatically)
```bash
auto-logmonitor
```

### 3. Edit config.json
```json
{
  "source": {
    "type": "command",
    "command": "tail -f /var/log/app.log"
  },
  "output": {
    "type": "api",
    "apiEndpoint": "https://your-api.com/logs",
    "apiKey": "your-api-key"
  }
}
```

### 4. Run again
```bash
auto-logmonitor
```

## 🚀 What's New 

- **Native File Watching:** Uses chokidar for efficient, cross-platform file monitoring (no polling, handles log rotation better).
- **Memory Pressure Handling:** Log buffer flushes or drops logs if buffer exceeds configured limits, preventing OOM.
- **Pre-compiled Regex Filtering:** Filtering patterns are compiled once for performance.
- **Improved Error Handling:** More robust error catching and logging throughout the codebase.
- **Graceful Shutdown:** Cleans up file watchers, Kafka producers, and flushes logs on exit.
- **Disk Queue for API Output:** Failed batches are persisted to disk and retried, improving reliability.
- **Horizontal Scaling:** For extreme log volumes, run multiple instances (e.g., in Docker/K8s).

## 📋 Features

- ✅ **Simple Setup** - Just edit config.json
- ✅ **High Performance** - Handles 100s of GB with low memory usage
- ✅ **Multiple Sources** - Monitor commands, files (with native watcher), or both
- ✅ **Smart Filtering** - Send only relevant logs (pre-compiled regex)
- ✅ **Batch Processing** - Efficient API/Kafka calls with compression and memory pressure flush
- ✅ **Auto Restart** - Commands restart automatically on failure
- ✅ **Real-time Alerts** - Immediate critical log alerts
- ✅ **Kafka Support** - Built-in Kafka producer/consumer
- ✅ **Environment Variables** - Override config for different environments (recommended for secrets)
- ✅ **Docker Ready** - Perfect for containerized deployments
- ✅ **Disk Queue** - Reliable API output with disk-based retry
- ✅ **Graceful Shutdown** - Cleans up resources and flushes logs on exit

## ⚙️ Configuration Guide

The tool creates a `config.json` file in your current directory. This is the **only file you need to edit** to configure everything.

### 📁 Complete Configuration Structure

```json
{
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
    "clientId": "auto-logmonitor",
    "maxRetries": 5,
    "timeout": 30000,
    "maxPendingMessages": 1000,
    "consumerFilter": ""
  },
  "performance": {
    "maxMemoryMB": 512,
    "maxQueueSize": 10000,
    "compression": true,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "queueDir": "./log-disk-queue",
    "concurrency": 10,
    "apiRateLimit": 10,
    "batchMinutes": 1
  },
  "logging": {
    "level": "info",
    "file": "auto-logmonitor.log",
    "maxSize": "10MB",
    "maxFiles": 5
  }
}
```

## 🔧 Configuration Sections Explained

### 1. **Source Configuration** - Where to get logs from

The `source.type` field determines where the tool gets logs from. There are two main types:

#### Command Mode (`"command"`) - Monitor a running command/process
```json
{
  "source": {
    "type": "command",
    "command": "tail -f /var/log/app.log",
    "follow": true,
    "fromBeginning": false
  }
}
```

**Purpose:** Run a command and capture its output in real-time.

**Best Practices:**
- Use `tail -f` for following log files
- Test your command manually first
- Use absolute paths for reliability
- Add error handling to your command if needed

**Examples:**
```json
// Follow application logs
"command": "tail -f /var/log/myapp.log"

// Follow Docker container logs
"command": "docker logs -f my-container"

// Follow multiple files
"command": "tail -f /var/log/app.log /var/log/error.log"

// Follow with grep filtering
"command": "tail -f /var/log/app.log | grep -v DEBUG"

// Follow system logs
"command": "journalctl -f -u my-service"

// Follow with custom formatting
"command": "tail -f /var/log/app.log | awk '{print \"[APP] \" $0}'"

// Monitor npm development server
"command": "npm run dev"

// Monitor Docker containers
"command": "docker logs -f container1 container2"

// Monitor system services
"command": "journalctl -f -u nginx -u mysql"

// Monitor with filtering
"command": "tail -f /var/log/app.log | grep -v DEBUG"

// Monitor multiple commands
"command": "npm run dev & npm run test:watch"
```

#### File Mode (`"file"`) - Monitor a specific log file
```json
{
  "source": {
    "type": "file",
    "file": "/var/log/app.log",
    "follow": true,
    "fromBeginning": false
  }
}
```

**Purpose:** Monitor a specific log file directly.

**Best Practices:**
- Use for single file monitoring
- Set `fromBeginning: true` to process existing content
- Use `follow: true` for real-time monitoring

### 2. **Filters Configuration** - What logs to process

```json
{
  "filters": {
    "sendPattern": "ERROR|CRITICAL|WARN",
    "alertPattern": "CRITICAL|FATAL",
    "ignorePattern": "DEBUG|TRACE"
  }
}
```

#### sendPattern
**Purpose:** Which log entries to send to your API/Kafka.

**Best Practices:**
- Use uppercase patterns for consistency
- Include severity levels (ERROR, WARN, INFO)
- Use `|` to separate multiple patterns
- Test patterns with your actual log format

**Examples:**
```json
// Send all errors and warnings
"sendPattern": "ERROR|WARN|CRITICAL|FATAL"

// Send only specific error types
"sendPattern": "DatabaseError|ConnectionError|TimeoutError"

// Send logs with specific format
"sendPattern": "\\[ERROR\\]|\\[CRITICAL\\]"

// Send everything (not recommended for production)
"sendPattern": ".*"
```

#### alertPattern
**Purpose:** Which log entries to show as immediate alerts in console.

**Best Practices:**
- Use for critical issues that need immediate attention
- Keep it focused on truly critical events
- Use more specific patterns than sendPattern

**Examples:**
```json
// Alert on critical system issues
"alertPattern": "CRITICAL|FATAL|PANIC"

// Alert on security issues
"alertPattern": "SECURITY|AUTH_FAILED|INTRUSION"

// Alert on database issues
"alertPattern": "DB_CONNECTION_FAILED|DATABASE_DOWN"
```

#### ignorePattern
**Purpose:** Which log entries to completely ignore.

**Best Practices:**
- Use to filter out noise (debug logs, health checks)
- Be careful not to ignore important logs
- Test thoroughly before using in production

**Examples:**
```json
// Ignore debug and trace logs
"ignorePattern": "DEBUG|TRACE"

// Ignore health check logs
"ignorePattern": "health_check|ping"

// Ignore specific noisy patterns
"ignorePattern": "heartbeat|keepalive"
```

### 3. **Output Configuration** - Where to send logs

#### API Mode
```json
{
  "output": {
    "type": "api",
    "apiEndpoint": "https://your-api.com/logs",
    "apiKey": "your-api-key",
    "batchSize": 100,
    "batchTimeout": 5000
  }
}
```

**Purpose:** Send logs to an HTTP API endpoint.

**Best Practices:**
- Use HTTPS for production
- Include authentication (API key)
- Set appropriate batch sizes
- Configure timeouts based on your API

**Examples:**
```json
// Basic API configuration
{
  "type": "api",
  "apiEndpoint": "https://logs.example.com/api/v1/logs",
  "apiKey": "your-secret-api-key",
  "batchSize": 100,
  "batchTimeout": 5000
}

// High-volume configuration
{
  "type": "api",
  "apiEndpoint": "https://logs.example.com/api/v1/logs",
  "apiKey": "your-secret-api-key",
  "batchSize": 500,
  "batchTimeout": 10000
}
```

#### Kafka Mode
```json
{
  "output": {
    "type": "kafka"
  },
  "kafka": {
    "enabled": true,
    "brokers": ["localhost:9092"],
    "topic": "log-streams",
    "clientId": "auto-logmonitor"
  }
}
```

**Purpose:** Send logs to Apache Kafka for high-throughput processing.

**Best Practices:**
- Use multiple brokers for reliability
- Set appropriate topic names
- Configure retry settings
- Monitor Kafka cluster health

**Examples:**
```json
// Single broker setup
{
  "enabled": true,
  "brokers": ["localhost:9092"],
  "topic": "application-logs",
  "clientId": "app-logmonitor"
}

// Multi-broker production setup
{
  "enabled": true,
  "brokers": ["kafka1:9092", "kafka2:9092", "kafka3:9092"],
  "topic": "production-logs",
  "clientId": "prod-logmonitor",
  "maxRetries": 10,
  "timeout": 60000
}
```

### 4. **Performance Configuration** - Tune for your environment

```json
{
  "performance": {
    "maxMemoryMB": 512,
    "maxQueueSize": 10000,
    "compression": true,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "queueDir": "./log-disk-queue",
    "concurrency": 10,
    "apiRateLimit": 10,
    "batchMinutes": 1
  }
}
```

#### Memory Management
- **maxMemoryMB**: Maximum memory usage (default: 512MB)
- **maxQueueSize**: Maximum items in processing queue (default: 10,000)

#### Processing Settings
- **concurrency**: Number of concurrent operations (default: 10)
- **apiRateLimit**: API calls per second (default: 10)
- **batchMinutes**: How often to process batches (default: 1 minute)

#### Reliability Settings
- **retryAttempts**: Number of retry attempts (default: 3)
- **retryDelay**: Delay between retries in milliseconds (default: 1000)
- **compression**: Enable compression for network efficiency (default: true)

#### Metrics and Monitoring
- **batchMinutes**: Controls both batch processing interval and metrics output frequency
- Metrics are displayed **only when batches are sent** (not continuously)
- Metrics include: processed logs, sent logs, errors, alerts, buffer size, memory usage, and uptime
- Memory warnings are still shown every 30 seconds if memory usage is high

**Performance Tuning Examples:**

```json
// Low-resource environment
{
  "maxMemoryMB": 256,
  "maxQueueSize": 5000,
  "concurrency": 5,
  "apiRateLimit": 5,
  "batchSize": 50
}

// High-performance environment
{
  "maxMemoryMB": 2048,
  "maxQueueSize": 50000,
  "concurrency": 20,
  "apiRateLimit": 50,
  "batchSize": 500
}

// Production environment
{
  "maxMemoryMB": 1024,
  "maxQueueSize": 25000,
  "concurrency": 15,
  "apiRateLimit": 25,
  "batchSize": 200,
  "retryAttempts": 5,
  "retryDelay": 2000
}
```

## 🌍 Environment Variables

You can override any config.json setting using environment variables. Environment variables take precedence over config.json values.

### Quick Examples

```bash
# Override API endpoint
export API_ENDPOINT="https://my-api.com/logs"
export API_KEY="my-secret-key"
auto-logmonitor

# Enable Kafka
export USE_KAFKA="true"
export KAFKA_BROKERS="kafka1:9092,kafka2:9092"
export KAFKA_TOPIC="production-logs"
auto-logmonitor

# Performance tuning
export BATCH_SIZE="500"
export CONCURRENCY="20"
export API_RATE_LIMIT="50"
auto-logmonitor
```

### Available Environment Variables

| Category | Variable | Description | Default |
|----------|----------|-------------|---------|
| **Source** | `COMMAND` | Command to execute | `""` |
| | `FILENAME` | File path to monitor | `null` |
| | `FOLLOW` | Follow file changes | `true` |
| | `FROM_BEGINNING` | Start from beginning | `false` |
| **Filters** | `WHAT_TO_SEND` | Regex for logs to send | `"ERROR\|CRITICAL"` |
| | `ALERT_REGEX` | Regex for alert logs | `"CRITICAL"` |
| | `IGNORE_PATTERN` | Regex for logs to ignore | `null` |
| **Output** | `API_ENDPOINT` | API endpoint URL | `""` |
| | `API_KEY` | API authentication key | `""` |
| | `BATCH_SIZE` | Batch size | `100` |
| | `BATCH_TIMEOUT` | Batch timeout (ms) | `5000` |
| **Performance** | `CHUNK_SIZE_MB` | Memory limit (MB) | `512` |
| | `MAX_QUEUE_SIZE` | Queue size limit | `10000` |
| | `CONCURRENCY` | Concurrent operations | `10` |
| | `API_RATE_LIMIT` | Rate limit per second | `10` |
| | `RETRY_ATTEMPTS` | Retry attempts | `3` |
| | `COMPRESSION` | Enable compression | `true` |
| **Kafka** | `USE_KAFKA` | Enable Kafka mode | `false` |
| | `KAFKA_BROKERS` | Broker list | `["localhost:9092"]` |
| | `KAFKA_TOPIC` | Topic name | `"log-streams"` |
| | `KAFKA_CLIENT_ID` | Client identifier | `"auto-logmonitor"` |
| **Logging** | `LOG_LEVEL` | Log level | `"info"` |
| | `LOG_FILE` | Log file path | `"auto-logmonitor.log"` |

## 🐳 Docker Deployment

### Dockerfile Example

```dockerfile
FROM node:18-alpine

# Install the CLI tool
RUN npm install -g auto-logmonitor

# Set working directory
WORKDIR /app

# Copy config file
COPY config.json .

# Set environment variables
ENV API_ENDPOINT="https://logs.example.com/api"
ENV USE_KAFKA="true"
ENV KAFKA_BROKERS="kafka:9092"
ENV BATCH_SIZE="200"
ENV CONCURRENCY="15"

# Run the tool
CMD ["auto-logmonitor"]
```

### Docker Compose Example

```yaml
version: '3.8'
services:
  logmonitor:
    image: auto-logmonitor:latest
    environment:
      - API_ENDPOINT=https://logs.example.com/api
      - API_KEY=${API_KEY}
      - USE_KAFKA=true
      - KAFKA_BROKERS=kafka:9092
      - KAFKA_TOPIC=app-logs
      - BATCH_SIZE=100
      - CONCURRENCY=10
    volumes:
      - /var/log:/var/log:ro
      - ./config.json:/app/config.json:ro
      - ./log-disk-queue:/app/log-disk-queue
    restart: unless-stopped
    depends_on:
      - kafka

  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
```

## ☸️ Kubernetes Deployment

### ConfigMap Example

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: logmonitor-config
data:
  API_ENDPOINT: "https://logs.example.com/api"
  USE_KAFKA: "true"
  KAFKA_BROKERS: "kafka-cluster:9092"
  KAFKA_TOPIC: "kubernetes-logs"
  BATCH_SIZE: "100"
  CONCURRENCY: "10"
  MAX_QUEUE_SIZE: "25000"
```

### Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: logmonitor
spec:
  replicas: 2
  selector:
    matchLabels:
      app: logmonitor
  template:
    metadata:
      labels:
        app: logmonitor
    spec:
      containers:
      - name: logmonitor
        image: auto-logmonitor:latest
        envFrom:
        - configMapRef:
            name: logmonitor-config
        env:
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: logmonitor-secret
              key: api-key
        volumeMounts:
        - name: logs
          mountPath: /var/log
          readOnly: true
        - name: config
          mountPath: /app/config.json
          subPath: config.json
      volumes:
      - name: logs
        hostPath:
          path: /var/log
      - name: config
        configMap:
          name: logmonitor-config
```

## 📊 Monitoring and Troubleshooting

### Health Monitoring

The tool provides built-in health monitoring:

```bash
# Check if the tool is running
ps aux | grep auto-logmonitor

# Check log files
tail -f auto-logmonitor.log

# Check queue status
ls -la log-disk-queue/
```

### Common Issues and Solutions

#### 1. **Command Not Found**
```bash
# Solution: Install globally
npm install -g auto-logmonitor
```

#### 2. **Permission Denied**
```bash
# Solution: Check file permissions
sudo chmod 644 /var/log/app.log
sudo chown $USER:$USER /var/log/app.log
```

#### 3. **API Connection Failed**
```bash
# Check network connectivity
curl -X POST https://your-api.com/logs

# Check API key
echo $API_KEY
```

#### 4. **Kafka Connection Failed**
```bash
# Check Kafka is running
nc -z localhost 9092

# Check Kafka topic exists
kafka-topics.sh --list --bootstrap-server localhost:9092
```

#### 5. **High Memory Usage**
```json
// Reduce memory usage
{
  "performance": {
    "maxMemoryMB": 256,
    "maxQueueSize": 5000,
    "batchSize": 50
  }
}
```

#### 6. **Slow Processing**
```json
// Increase performance
{
  "performance": {
    "concurrency": 20,
    "apiRateLimit": 50,
    "batchSize": 500
  }
}
```

### Log Levels

Set the log level to get more detailed information:

```bash
export LOG_LEVEL="debug"
auto-logmonitor
```

Available levels: `debug`, `info`, `warn`, `error`

## 🔒 Security Best Practices

### 1. **API Keys and Secrets**
- Store API keys in environment variables, not config.json
- Use Kubernetes secrets or Docker secrets
- Rotate API keys regularly

### 2. **File Permissions**
- Use read-only mounts for log files
- Restrict access to config.json
- Use dedicated service accounts

### 3. **Network Security**
- Use HTTPS for API endpoints
- Use TLS for Kafka connections
- Implement proper authentication

### 4. **Container Security**
- Run containers as non-root users
- Use minimal base images
- Scan images for vulnerabilities

## 📈 Performance Tuning

### High-Volume Logs (100+ GB/day)

```json
{
  "performance": {
    "maxMemoryMB": 2048,
    "maxQueueSize": 100000,
    "concurrency": 30,
    "apiRateLimit": 100,
    "batchSize": 1000,
    "compression": true
  },
  "output": {
    "batchTimeout": 10000
  }
}
```

### Low-Resource Environment

```json
{
  "performance": {
    "maxMemoryMB": 128,
    "maxQueueSize": 1000,
    "concurrency": 3,
    "apiRateLimit": 5,
    "batchSize": 25
  }
}
```

### Production Environment

```json
{
  "performance": {
    "maxMemoryMB": 1024,
    "maxQueueSize": 25000,
    "concurrency": 15,
    "apiRateLimit": 25,
    "batchSize": 200,
    "retryAttempts": 5,
    "retryDelay": 2000
  }
}
```

## 🚀 Getting Started Examples

### Example 1: Monitor Application Logs

```json
{
  "source": {
    "type": "command",
    "command": "tail -f /var/log/myapp.log"
  },
  "filters": {
    "sendPattern": "ERROR|WARN|CRITICAL",
    "alertPattern": "CRITICAL|FATAL"
  },
  "output": {
    "type": "api",
    "apiEndpoint": "https://logs.example.com/api",
    "apiKey": "your-api-key"
  }
}
```

### Example 2: Monitor Docker Containers

```json
{
  "source": {
    "type": "command",
    "command": "docker logs -f container1 container2"
  },
  "filters": {
    "sendPattern": "ERROR|WARN|Exception",
    "alertPattern": "FATAL|PANIC"
  },
  "output": {
    "type": "kafka"
  },
  "kafka": {
    "enabled": true,
    "brokers": ["localhost:9092"],
    "topic": "docker-logs"
  }
}
```

### Example 3: Monitor System Logs

```json
{
  "source": {
    "type": "command",
    "command": "journalctl -f -u nginx -u mysql"
  },
  "filters": {
    "sendPattern": "error|failed|critical",
    "alertPattern": "emergency|panic"
  },
  "output": {
    "type": "api",
    "apiEndpoint": "https://logs.example.com/api"
  }
}
```

## 📞 Support

For issues, questions, or contributions:

1. Check the troubleshooting section above
2. Review the configuration examples
3. Check the log files for detailed error messages
4. Ensure all dependencies are properly installed

## 📄 License

This project is licensed under the MIT License. 

## ⚠️ Security & Best Practices

- **Do NOT store secrets (API keys, etc.) in config.json.** Use environment variables instead.
- **The 'command' source uses shell: true.** Only use trusted config files and environment variables to avoid shell injection risks.
- **Set proper file permissions** on config.json and log files.

## 🚦 Current Limitations & Areas for Contribution

- **No Prometheus/Health Endpoints:** Only console metrics are available.
- **No Automated Tests:** Add Jest/Mocha tests for core logic to improve reliability.
- **No Input Validation:** Config values are not strictly validated; fail fast on invalid input is a good next step.
- **Shell Injection Risk:** 'command' source uses shell: true for flexibility, but only use trusted configs. 