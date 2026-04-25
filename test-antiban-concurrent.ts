import { AntiBan } from './apps/api/node_modules/baileys-antiban/dist/antiban.js';
const antiban = new AntiBan();

async function test() {
    let allowedCount = 0;
    const promises = [];
    for (let i = 0; i < 55; i++) {
        promises.push((async () => {
            const decision = await antiban.beforeSend(`123456${i}@s.whatsapp.net`, 'Hello');
            if (decision.allowed) {
                allowedCount++;
                antiban.afterSend(`123456${i}@s.whatsapp.net`, 'Hello');
            }
        })());
    }
    await Promise.all(promises);
    console.log('Allowed concurrent:', allowedCount);
}

test();
