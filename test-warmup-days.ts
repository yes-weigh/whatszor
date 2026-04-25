import { WarmUp } from './apps/api/node_modules/baileys-antiban/dist/warmup.js';
const w = new WarmUp() as any;

// apply patches
const originalGetCurrentDay = w.getCurrentDay.bind(w);
w.getCurrentDay = function() {
    if (this.state.dailyCounts.length === 0) {
        this.state.startedAt = Date.now();
        return 0;
    }
    return originalGetCurrentDay();
};

const originalCanSend = w.canSend.bind(w);
w.canSend = function() {
    const allowed = originalCanSend();
    if (allowed) {
        const day = this.getCurrentDay();
        while (this.state.dailyCounts.length <= day) {
            this.state.dailyCounts.push(0);
        }
        this.state.dailyCounts[day]++;
    }
    return allowed;
};

w.record = function() {
    this.state.lastActiveAt = Date.now();
};

// simulate 2 days passing without sending anything
w.state.startedAt -= 2 * 24 * 60 * 60 * 1000;

console.log('day before send:', w.getCurrentDay());
console.log('limit before send:', w.getDailyLimit());

// now send 25 concurrent messages
let allowed = 0;
for (let i = 0; i < 25; i++) {
    if (w.canSend()) {
        allowed++;
    }
}
console.log('allowed messages:', allowed);
console.log('daily counts after:', w.state.dailyCounts);
console.log('day after send:', w.getCurrentDay());
