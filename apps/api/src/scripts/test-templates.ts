import { connectDatabase, disconnectDatabase, prisma } from '../prisma/client';
import { waManager } from '../modules/whatsapp/whatsapp.service';

async function run() {
    await connectDatabase();

    const accounts = await prisma.whatsAppAccount.findMany({
        where: { status: 'CONNECTED', deletedAt: null }
    });
    if (accounts.length === 0) process.exit(1);

    const session = accounts[0];
    console.log(`Using session: ${session.sessionId}`);

    await waManager.restoreAllSessions();
    await new Promise(r => setTimeout(r, 5000));
    const socket = waManager.getSafeSocket(session.sessionId);
    
    const lastMessage = await prisma.message.findFirst({
        where: { direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        include: { conversation: true }
    });

    const jid = lastMessage!.conversation.providerId.includes('@s.whatsapp.net') 
        ? lastMessage!.conversation.providerId 
        : `${lastMessage!.conversation.providerId}@s.whatsapp.net`;

    console.log(`Sending to JID: ${jid}`);

    // TEST 1: The current outbound worker structure
    try {
        console.log('Sending Test 1: MATCH outbound-message.worker.ts Payload');
        const payload1 = {
            text: 'Test 1: Standard Interactive Buttons',
            footer: 'This is a footer',
            interactiveButtons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({ display_text: 'Reply 1', id: 'r1' })
                }
            ]
        };
        console.log("PAYLOAD 1:", JSON.stringify(payload1));
        const res1 = await socket.sendMessage(jid, payload1 as any);
        console.log('✅ Test 1 Success! Key:', res1?.key);
    } catch (err: any) {
        console.log('❌ Test 1 Error:', err.message);
    }
    
    // TEST 2: Template Buttons Array
    try {
        console.log('\nSending Test 2: Template Buttons Array');
        const payload2 = {
            text: 'Test 2 Buttons msg',
            footer: 'Footer',
            templateButtons: [
                { index: 1, quickReplyButton: { displayText: 'Click me', id: 'id1' } }
            ]
        };
        console.log("PAYLOAD 2:", JSON.stringify(payload2));
        const res2 = await socket.sendMessage(jid, payload2 as any);
        console.log('✅ Test 2 Success! Key:', res2?.key);
    } catch (err: any) {
        console.log('❌ Test 2 Error:', err.message);
    }

    try {
        console.log('\nSending Test 3: InteractiveMessage native object');
        const msg = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: {
                        header: {
                            title: 'Interactive Title',
                            hasMediaAttachment: false
                        },
                        body: { text: 'Test 3 native protobuf Interactive message' },
                        footer: { text: 'Footer text' },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({ display_text: 'Native Reply', id: 'native1'})
                                }
                            ]
                        }
                    }
                }
            }
        };
        console.log("PAYLOAD 3:", JSON.stringify(msg));
        const res3 = await socket.relayMessage(jid, msg as any, {});
        console.log('✅ Test 3 Success!', res3);
    } catch (err: any) {
        console.log('❌ Test 3 Error:', err.message);
    }
    
    await new Promise(r => setTimeout(r, 2000));
    await waManager.closeAll();
    await disconnectDatabase();
    process.exit(0);
}
run();
