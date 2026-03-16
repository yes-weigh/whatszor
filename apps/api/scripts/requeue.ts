import { prisma } from '../src/prisma/client';
import { outboundMessagesQueue } from '../src/core/queue';
import util from 'util';

async function run() {
  const msg = await prisma.message.findUnique({
    where: { id: 'cmmqewynn00l011mu29hy271f' }
  });
  
  if (!msg) {
      console.log('Message not found');
      return;
  }

  // Find recipient JID
  const conv = await prisma.conversation.findUnique({
      where: { id: msg.conversationId }
  });

  console.log('Requeueing message...');
  await outboundMessagesQueue.add(`send-${msg.id}`, {
    workspaceId: conv?.workspaceId,
    messageId: msg.id,
    toJid: conv?.providerId,
    type: msg.type,
    content: msg.content,
    mediaData: msg.mediaData,
    campaignId: undefined // avoid modifying campaign stats for a retry
  });

  console.log('Successfully enqueued');
  console.log('RAW JSON:', JSON.stringify(msg.mediaData, null, 2));
  process.exit(0);
}
run();
