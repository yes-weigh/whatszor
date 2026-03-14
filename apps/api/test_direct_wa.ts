import { prisma } from './src/prisma/client';
import { waManager } from './src/modules/whatsapp/whatsapp.service';

async function main() {
    process.env.NODE_ENV = 'development';
    await waManager.restoreAllSessions();
    await new Promise(r => setTimeout(r, 4000));

    const defaultAccount = await prisma.whatsAppAccount.findFirst({
        where: { status: 'CONNECTED' }
    });
    
    if (!defaultAccount) {
        console.error("No connected account available");
        process.exit(1);
    }
    const sock = waManager.getSocket(defaultAccount.sessionId);

    const toJid = "918089059824@s.whatsapp.net"; // the active contact

    const buttonMessage: any = {
        text: "bbu (Direct WA socket test)",
        footer: "sdf",
        interactiveButtons: [
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({ display_text: "New Button", id: "btn_id_0" })
            }
        ]
    };

    console.log("Sending payload:", JSON.stringify(buttonMessage, null, 2));

    try {
        const result = await sock.sendMessage(toJid, buttonMessage);
        console.log("Sent successfully! Result:", result?.key);
    } catch (e: any) {
        console.error("Failed directly inside Baileys:", e);
    }

    process.exit(0);
}

main();
