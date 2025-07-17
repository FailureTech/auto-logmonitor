# Auto Log Monitor - Advanced, Developer-Friendly CLI

Auto Log Monitor is a robust, high-performance CLI tool for real-time log monitoring, alerting, and forwarding to APIs or Kafka—**designed especially for developers**. You get production-grade reliability and features without needing to be an SRE, DevOps, or infrastructure expert.

- **Zero DevOps required:** Simple config file or environment variables—no deep infra knowledge needed
- **Multiple log sources:** Monitor files or any command/process output (e.g., tail, docker logs, journalctl)
- **Smart filtering:** Regex-based filtering, alerting, and ignore patterns
- **Batching & reliability:** Efficient batch processing, disk-based queue with optional compression, and a dead-letter queue for failed batches. If a batch fails to send after all `retryAttempts`, it is automatically moved to the dead-letter queue for inspection or manual reprocessing.
- **Alerting:** SMTP email alerts for critical log events, configurable via file or environment variables
- **Metrics & observability:** Built-in metrics for queue size, retries, memory, and more
- **Production ready:** Handles log rotation, memory pressure, and auto-restarts sources on failure
- **Easy deployment:** Native Docker and Kubernetes support, but works great locally or in CI too

**Perfect for developers who want powerful log shipping and alerting—without the hassle of learning DevOps or SRE.**

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

### 🔑 config.json Key Reference

#### **source** (Where to get logs from)
| Key            | Type     | Example/Default                | Description                                                      |
|----------------|----------|-------------------------------|------------------------------------------------------------------|
| type           | string   | "command" or "file"           | Source type: command output or file monitoring                    |
| command        | string   | "tail -f /var/log/app.log"    | Command to run (if type is command)                              |
| file           | string   | "/var/log/app.log"            | File path to monitor (if type is file)                            |
| follow         | boolean  | true                          | Follow file/command output in real time                           |
| fromBeginning  | boolean  | false                         | Start from beginning of file (if type is file)                    |

#### **filters** (Log filtering)
| Key           | Type    | Example/Default                | Description                                                      |
|---------------|---------|-------------------------------|------------------------------------------------------------------|
| sendPattern   | string  | "ERROR|CRITICAL|WARN"         | Regex: logs to send to output                                    |
| alertPattern  | string  | "CRITICAL|FATAL"              | Regex: logs to alert in console                                  |
| ignorePattern | string  | "DEBUG|TRACE"                  | Regex: logs to ignore completely                                 |

#### **output** (Where to send logs)
| Key         | Type    | Example/Default                | Description                                                      |
|-------------|---------|-------------------------------|------------------------------------------------------------------|
| type        | string  | "api" or "kafka"              | Output type: API or Kafka                                        |
| apiEndpoint | string  | "https://your-api.com/logs"   | API endpoint URL (if type is api)                                |
| apiKey      | string  | "your-api-key"                | API key for authentication (if type is api)                      |
| batchSize   | number  | 100                            | Max log lines per batch before sending                           |
| batchTimeout| number  | 5000                           | Max time (ms) to wait before sending a batch                     |

#### **kafka** (Kafka output settings)
| Key                | Type      | Example/Default                | Description                                                      |
|--------------------|-----------|-------------------------------|------------------------------------------------------------------|
| enabled            | boolean   | false                         | Enable Kafka output                                              |
| brokers            | array     | ["localhost:9092"]            | List of Kafka broker addresses                                   |
| topic              | string    | "log-streams"                 | Kafka topic to send logs to                                      |
| clientId           | string    | "auto-logmonitor"             | Kafka client identifier                                          |
| maxRetries         | number    | 5                             | Max retries for failed sends                                     |
| timeout            | number    | 30000                         | Kafka send timeout (ms)                                          |
| maxPendingMessages | number    | 1000                          | Max pending messages in Kafka producer                           |
| consumerFilter     | string    | ""                            | Regex: filter for Kafka consumer                                 |

#### **performance** (Resource and reliability tuning)
| Key           | Type    | Example/Default                | Description                                                      |
|---------------|---------|-------------------------------|------------------------------------------------------------------|
| maxMemoryMB   | number  | 512                            | Max memory usage before warning/trim (MB)                        |
| maxQueueSize  | number  | 10000                          | Max log lines in buffer before forced flush/drop                 |
| compression   | boolean | true                           | Enable gzip compression for batches                              |
| retryAttempts | number  | 3                              | Number of retries for failed batches                             |
| retryDelay    | number  | 1000                           | Delay (ms) between retries                                      |
| queueDir      | string  | "./log-disk-queue"             | Directory for disk-based queue                                   |
| concurrency   | number  | 10                             | Number of concurrent send operations                             |
| apiRateLimit  | number  | 10                             | Max API calls per second                                         |
| batchMinutes  | number  | 1                              | Time interval (minutes) for batch flush                          |

#### **logging** (Log file settings)
| Key        | Type    | Example/Default                | Description                                                      |
|------------|---------|-------------------------------|------------------------------------------------------------------|
| level      | string  | "info"                        | Log level: debug, info, warn, error                              |
| file       | string  | "auto-logmonitor.log"         | Log file name                                                    |
| maxSize    | string  | "10MB"                        | Max log file size before rotation                                |
| maxFiles   | number  | 5                             | Max number of rotated log files to keep                          |

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

## ⚡ Performance Options Explained

| Option         | What it Controls                        | Unit/Type         | Default      | What is “item”?         |
|----------------|----------------------------------------|-------------------|--------------|-------------------------|
| maxMemoryMB    | Max process memory before warning/trim  | Megabytes (MB)    | 512          | N/A                     |
| maxQueueSize   | Max log lines in buffer before flush    | Log lines         | 10,000       | **Log lines**           |
| batchSize      | Max log lines per batch before sending  | Log lines         | 100          | **Log lines**           |
| compression    | Compress batches before sending         | Boolean           | true         | N/A                     |
| retryAttempts  | Number of retries for failed batches    | Integer           | 3            | N/A                     |
| retryDelay     | Delay between retries                   | Milliseconds (ms) | 1000         | N/A                     |
| queueDir       | Disk queue directory                    | Path (string)     | ./log-disk-queue | N/A                  |
| concurrency    | Concurrent send operations              | Integer           | 10           | N/A                     |
| apiRateLimit   | Max API calls per second                | Integer           | 10           | N/A                     |
| batchMinutes   | Time interval for batch flush           | Minutes           | 1            | N/A                     |

**Notes:**
- **batchSize**: The maximum number of log lines to collect before sending a batch to the API/Kafka. When this number is reached, the batch is sent immediately.
- **maxQueueSize**: This is the maximum number of log lines that can be held in memory before a batch is forced to flush or, if still too large, dropped.
- **maxMemoryMB**: If memory usage exceeds this, the CLI will warn and may trim the buffer to avoid OOM errors.
- **compression**: Enables gzip compression for batches (if supported by the output).
- **retryAttempts/retryDelay**: Control how many times and how often failed batches are retried.
- **queueDir**: Where failed batches are stored for retry (disk-based queue).
- **concurrency/apiRateLimit**: Control throughput and prevent overloading the API.
- **batchMinutes**: Ensures logs are sent regularly, even during low log volume periods.

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

## SMTP Alert Configuration (Environment Variables)

To enable email alerts, set the following environment variables before running the CLI:

| Variable           | Description                | Example                        |
|--------------------|---------------------------|---------------------------------|
| SMTP_HOST          | SMTP server host           | smtp.gmail.com                 |
| SMTP_PORT          | SMTP server port           | 587                            |
| SMTP_SECURE        | Use TLS/SSL (true/false)   | false                          |
| SMTP_USER          | SMTP username/email        | your@email.com                 |
| SMTP_PASS          | SMTP password/app password | yourpassword                   |
| SMTP_RECIPIENTS    | Comma-separated emails     | user1@email.com,user2@email.com|

**Example:**
```bash
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT=587
export SMTP_SECURE=false
export SMTP_USER="your@email.com"
export SMTP_PASS="yourapppassword"
export SMTP_RECIPIENTS="user1@email.com,user2@email.com"
node simple-cli.js
```

If both config.json and environment variables are set, environment variables take precedence.

## 📧 SMTP Email Alert Feature

Auto LogMonitor can send alert emails when a log line matches the alert pattern. You can configure SMTP settings using either `config.json` or environment variables.

### Option 1: Configure via `config.json`

Add or update the `smtp` section in your `config.json`:

```json
"smtp": {
  "host": "smtp.gmail.com",
  "port": 587,
  "secure": false,
  "user": "your@email.com",
  "pass": "yourapppassword",
  "recipients": ["recipient1@email.com", "recipient2@email.com"]
}
```
- `host`: SMTP server hostname
- `port`: SMTP server port (usually 587 for TLS, 465 for SSL)
- `secure`: `true` for SSL, `false` for TLS
- `user`: SMTP username/email
- `pass`: SMTP password or app password
- `recipients`: Array of recipient email addresses

### Option 2: Configure via Environment Variables

Set the following environment variables (e.g., in a `.env` file or via `export`):

| Variable           | Description                | Example                        |
|--------------------|---------------------------|---------------------------------|
| SMTP_HOST          | SMTP server host           | smtp.gmail.com                 |
| SMTP_PORT          | SMTP server port           | 587                            |
| SMTP_SECURE        | Use TLS/SSL (true/false)   | false                          |
| SMTP_USER          | SMTP username/email        | your@email.com                 |
| SMTP_PASS          | SMTP password/app password | yourapppassword                |
| SMTP_RECIPIENTS    | Comma-separated emails     | user1@email.com,user2@email.com|

**Example .env:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@email.com
SMTP_PASS=yourapppassword
SMTP_RECIPIENTS=recipient1@email.com,recipient2@email.com
```

**Note:** If both config.json and environment variables are set, environment variables take precedence.

### How it works
- When a log line matches the `alertPattern`, an email is sent to all configured recipients.
- The email uses a styled HTML template for easy reading.
- You will see `📧 Alert email sent.` in the CLI output for each alert email sent.

---

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


---

## 🔄 How It Works

1. **Log Source:** Reads logs from a file or command output.
2. **Filtering:** Applies regex filters to decide which logs to send, alert, or ignore.
3. **Batching:** Collects logs into batches based on size or time.
4. **Output:** Sends batches to an API or Kafka, with retries and disk queue for reliability.
5. **Monitoring:** Prints metrics and alerts to the console.

**Flow Diagram:**
```
[Source: File/Command] → [Filtering] → [Batching] → [Output: API/Kafka]
                                         ↓
                                 [Disk Queue/Retry]
                                         ↓
                                   [Monitoring/Alerts]
```

---

## 🗜️ Working with Compressed Queue Files

If you enable `compression: true` in your config, queued log batches will be stored as `.gz` files (gzip-compressed) on disk **for efficient storage and retry**. 

> **Note:** Data sent over the API or Kafka is always uncompressed. The system automatically decompresses batches before sending, so your API or Kafka consumer always receives raw JSON.

### How to decompress a .gz file (for inspection or recovery)

**Using the command line (gzip):**
```bash
gzip -d /path/to/your/queue/file.gz
# This will produce /path/to/your/queue/file (uncompressed)
```

**Or, to view without extracting:**
```bash
gzip -dc /path/to/your/queue/file.gz | less
```

**Using Node.js:**
```js
const fs = require('fs');
const zlib = require('zlib');

const compressed = fs.readFileSync('file.gz');
const uncompressed = zlib.gunzipSync(compressed);
console.log(uncompressed.toString());
```

- All queued files with a `.gz` extension are gzip-compressed.
- You must decompress them before manual inspection or reprocessing.
- When the queue is running, it will automatically handle decompression for sending if needed.

---

## 📨 Dead-Letter Queue

If a log batch fails to send after the configured number of `retryAttempts`, it is automatically moved to the **dead-letter queue** (`log-disk-queue/dead-letter/`).

- This ensures no data is lost, even if repeated delivery attempts fail.
- You can inspect or manually reprocess these failed batches as needed.
- Dead-letter files are stored in the same format as regular queue files (compressed if enabled).

---

## ❓ FAQ

**Q: How do I send all logs, regardless of content?**  
A: Set `"sendPattern": ".*"` in your config.

**Q: How do I ignore certain log lines?**  
A: Use the `ignorePattern` key with a regex matching lines to ignore.

**Q: What happens if the API/Kafka is down?**  
A: Logs are queued on disk and retried until successful or max retries are reached.

**Q: Can I use both API and Kafka at the same time?**  
A: No, choose one output type per config. Run multiple instances if you need both.

**Q: How do I rotate logs?**  
A: Use the `maxSize` and `maxFiles` options in the `logging` section.

**Q: What does batchSize mean?**  
A: The maximum number of log lines to collect before sending a batch to the API/Kafka.

**Q: Can I run this in Docker or Kubernetes?**  
A: Yes! See the Docker and Kubernetes sections above for examples.

---

## 🛠️ Troubleshooting

- **Permission Denied:**
  - Ensure you have read access to the log file or command output.
  - Use `sudo` if necessary, or adjust file permissions.
- **API Connection Failed:**
  - Check your API endpoint and network connectivity.
  - Verify your API key is correct and not expired.
- **Kafka Connection Failed:**
  - Ensure Kafka is running and accessible at the specified broker address.
  - Check topic names and permissions.
- **High Memory Usage:**
  - Lower `maxMemoryMB`, `maxQueueSize`, or `batchSize` in your config.
- **Slow Processing:**
  - Increase `concurrency`, `apiRateLimit`, or `batchSize`.
- **No logs are being sent:**
  - Check your `sendPattern` and `ignorePattern` regexes.
  - Make sure your source is producing logs.

---

## 🏆 Best Practices

- Use environment variables for secrets (API keys, etc.).
- Set appropriate `batchSize` and `batchMinutes` for your log volume.
- Monitor memory usage and adjust `maxMemoryMB` and `maxQueueSize` as needed.
- Use Docker or Kubernetes for easy deployment and scaling.
- Regularly check your log files and disk queue for issues.
- Use HTTPS for API endpoints and secure your Kafka cluster.
- Test your regex patterns before deploying to production.
- Keep your dependencies up to date.

---

## 📖 Glossary

- **Batch:** A group of log lines sent together to the output (API/Kafka).
- **Log Line:** A single line of log data from your source.
- **Flush:** Sending the current batch of logs immediately.
- **Disk Queue:** Temporary storage for logs that couldn't be sent immediately.
- **Regex:** A regular expression used for filtering log lines.
- **Source:** Where logs are read from (file or command).
- **Output:** Where logs are sent (API or Kafka).
- **Alert:** A log line that matches the `alertPattern` and is shown in the console.


