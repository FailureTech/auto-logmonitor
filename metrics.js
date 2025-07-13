let successCount = 0;
let failureCount = 0;
let retryCount = 0;
let queueSize = 0;
let lastSuccessTime = null;
let peakQueueSize = 0;

function logSuccess() {
    successCount++;
    lastSuccessTime = new Date();
}

function logFailure() {
    failureCount++;
}

function logRetry() {
    retryCount++;
}

function updateQueueSize(size) {
    queueSize = size;
    peakQueueSize = Math.max(peakQueueSize, size);
}

function getQueueStats() {
    return {
        success: successCount,
        failures: failureCount,
        retries: retryCount,
        current: queueSize,
        peak: peakQueueSize,
        lastSuccess: lastSuccessTime
    };
}

function printMetrics() {
    const now = new Date();
    const memUsage = process.memoryUsage();

    console.log(`
📊 METRICS ${now.toISOString()}:
├── Success: ${successCount} ✅
├── Failures: ${failureCount} ❌
├── Retries: ${retryCount} 🔄
├── Queue: ${queueSize} items 🧵 (Peak: ${peakQueueSize})
├── Last Success: ${lastSuccessTime ? `${Math.round((now - lastSuccessTime)/1000)}s ago` : 'Never'} ⏱
├── Memory: ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS 📈
└── Uptime: ${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s ⏳
`);
}

module.exports = {
    logSuccess,
    logFailure,
    logRetry,
    updateQueueSize,
    getQueueStats,
    printMetrics
};