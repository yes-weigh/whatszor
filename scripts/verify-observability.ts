import { createServer } from '../apps/api/src/core/server';
import { getRedisClient } from '../apps/api/src/core/redis';
import { notificationService } from '../apps/api/src/core/notification.service';
import { startWorkers, stopWorkers } from '../apps/api/src/queues/worker';

async function verify() {
    console.log('🚀 Starting Observability Verification...');

    // 1. Validate /health/ready
    const server = await createServer();
    const response = await server.inject({
        method: 'GET',
        url: '/health/ready',
        headers: { 'x-health-secret': 'dev-health-secret' }
    });
    
    console.log('--- Health Readiness Status ---');
    console.log(JSON.stringify(response.json(), null, 2));

    // 2. Start workers to generate heartbeat
    console.log('\n--- Testing Worker Heartbeat ---');
    await startWorkers();
    
    // Wait for heartbeat
    await new Promise(r => setTimeout(r, 2000));
    
    const heartbeatResp = await server.inject({
        method: 'GET',
        url: '/health/ready',
        headers: { 'x-health-secret': 'dev-health-secret' }
    });
    console.log('Heartbeat check:', heartbeatResp.json().data.checks.worker);

    // 3. Simulate Alert Trigger
    console.log('\n--- Testing Alert Trigger ---');
    await notificationService.notifyFatal('VERIFICATION_TEST', { test: true });
    console.log('Alert dispatched (check console/webhook)');

    // 4. Trace Propagation Test (Mocking a request)
    console.log('\n--- Testing Trace Propagation ---');
    const traceResp = await server.inject({
        method: 'GET',
        url: '/health',
        headers: { 
            'x-health-secret': 'dev-health-secret',
            'x-trace-id': 'verify-trace-123' 
        }
    });
    console.log('Trace injected header:', traceResp.json());

    await stopWorkers();
    await server.close();
    console.log('\n✅ Verification sequence complete.');
    process.exit(0);
}

verify().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
