import { prisma } from './src/prisma/client';
import { waManager } from './src/modules/whatsapp/whatsapp.service';

async function run() {
    const waId = 'd17fca2d-3e5f-4daf-a68d-10671c532ddf';
    const acc = await prisma.whatsAppAccount.findUnique({ where: { sessionId: waId } });
    if (!acc) throw new Error("No account");
    console.log("Connecting", waId);
    
    // We bind a console listener just in case Baileys logs weird stuff unconditionally
    try {
        await waManager.connect(waId, acc.workspaceId);
    } catch(e) {
        console.error("waManager.connect THREW synchronously:", e);
    }
    
    // wait 15 seconds to see async close events
    await new Promise(r => setTimeout(r, 15000));
    console.log("Memory QR Check:", waManager.getQrCode(waId));
    console.log("Status check:", await prisma.whatsAppAccount.findUnique({ where: { sessionId: waId } }));
    process.exit(0);
}
run();
