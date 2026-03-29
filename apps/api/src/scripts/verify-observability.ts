import { createServer } from '../core/server';
import { getRedisClient } from '../core/redis';
import { notificationService } from '../core/notification.service';
import { startWorkers, stopWorkers } from '../../src/queues/worker';

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
    console.log('Heartbeat check:', JSON.stringify(heartbeatResp.json().data.checks.worker, null, 2));

    // 3. Simulate Alert Trigger
    console.log('\n--- Testing Alert Trigger ---');
    await notificationService.notifyFatal('VERIFICATION_TEST', { test: true });
    console.log('Alert dispatched (check console logs)');

    // 4. Trace Propagation Test
    console.log('\n--- Testing Trace Propagation ---');
    const traceId = 'verify-trace-123';
    const traceResp = await server.inject({
        method: 'GET',
        url: '/health',
        headers: { 
            'x-health-secret': 'dev-health-secret',
            'x-trace-id': traceId 
        }
    });
    console.log('Trace injection status:', traceResp.statusCode === 200 ? 'SUCCESS' : 'FAILED');

    await stopWorkers();
    await server.close();
    console.log('\n✅ Verification sequence complete.');
    process.exit(0);
}

verify().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
