import { prisma } from './src/prisma/client';
import { waManager } from './src/modules/whatsapp/whatsapp.service';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function main() {
    console.log("Starting...");
    // Mock the env since we're running a script directly
    process.env.NODE_ENV = 'development';
    
    await waManager.restoreAllSessions();
    await delay(3000); // give it time to connect
    
    const account = await prisma.whatsAppAccount.findFirst({
        where: { status: 'CONNECTED' },
    });
    
    if (!account) {
        console.error("No connected account found");
        process.exit(1);
    }
    
    const sock = waManager.getSocket(account.sessionId);
    if (!sock) {
        console.error("Socket not available");
        process.exit(1);
    }

    // Send to ourselves
    const toJid = account.phoneNumber ? `${account.phoneNumber}@s.whatsapp.net` : null;
    if (!toJid) {
        console.error("No phone number attached to account");
        process.exit(1);
    }

    console.log("Sending to:", toJid);

    try {
        console.log("1. Sending basic TEXT message to verify connection...");
        await sock.sendMessage(toJid, { text: "Basic ping from test script" });
        await delay(2000);

        console.log("2. Sending buttonsMessage (flat structure)...");
        const payloadFlat = {
            text: "This is a buttonsMessage test",
            footer: "Test Footer",
            buttons: [
                {
                    buttonId: 'btn1',
                    buttonText: { displayText: 'Click Me 1' },
                    type: 1
                }
            ],
            headerType: 1
        };
        await sock.sendMessage(toJid, payloadFlat as any);
        await delay(2000);

        console.log("3. Sending templateButtons...");
        const payloadTemplate = {
            text: "This is a templateButtons test",
            footer: "Test Footer",
            templateButtons: [
                {
                    index: 1,
                    quickReplyButton: {
                        displayText: 'Click Me 2',
                        id: 'btn2'
                    }
                }
            ]
        };
        await sock.sendMessage(toJid, payloadTemplate as any);
        await delay(2000);

        console.log("4. Sending nativeFlowMessage (interactiveButtons)...");
        const payloadInteractive = {
            text: "This is a nativeFlowMessage test",
            footer: "Test Footer",
            interactiveButtons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({ display_text: 'Click Me 3', id: 'btn3' })
                }
            ]
        };
        await sock.sendMessage(toJid, payloadInteractive as any);
        await delay(2000);

        console.log("All sent! Check your phone.");
    } catch (err: any) {
        console.error("Failed:", err.message);
        console.error(err.stack);
    }
    
    process.exit(0);
}

main();
