import { WarmUp } from './apps/api/node_modules/baileys-antiban/dist/warmup.js';
const w = new WarmUp();
console.log('status', w.getStatus());
for (let i = 0; i < 55; i++) {
    if (w.canSend()) {
        w.record();
    } else {
        console.log('Blocked at', i);
        break;
    }
}
