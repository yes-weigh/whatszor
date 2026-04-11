import client from 'prom-client';
import { Queue } from 'bullmq';

// Create a Registry
export const register = new client.Registry();

// Add default metrics (CPU, RAM, Event Loop Lag)
client.collectDefaultMetrics({ register });

// High-level Queue Depth
export const queueDepthGauge = new client.Gauge({
    name: 'bullmq_queue_depth',
    help: 'Number of jobs currently waiting or delayed in a BullMQ queue',
    labelNames: ['queue_name', 'status'],
    registers: [register],
});

// Throughput and processing rate
export const jobProcessingCounter = new client.Counter({
    name: 'bullmq_jobs_processed_total',
    help: 'Total processed jobs',
    labelNames: ['queue_name', 'status'],
    registers: [register],
});

// Latency
export const jobLatencyHistogram = new client.Histogram({
    name: 'bullmq_job_duration_seconds',
    help: 'Time spent processing jobs',
    labelNames: ['queue_name'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [register],
});

export async function collectQueueMetrics(queues: Queue[]) {
    // Update BullMQ queue depth continuously when /metrics is called
    for (const q of queues) {
        const counts = await q.getJobCounts('wait', 'active', 'delayed', 'failed', 'completed');
        queueDepthGauge.set({ queue_name: q.name, status: 'wait' }, counts.wait);
        queueDepthGauge.set({ queue_name: q.name, status: 'active' }, counts.active);
        queueDepthGauge.set({ queue_name: q.name, status: 'delayed' }, counts.delayed);
        queueDepthGauge.set({ queue_name: q.name, status: 'failed' }, counts.failed);
        queueDepthGauge.set({ queue_name: q.name, status: 'completed' }, counts.completed);
    }
}
