import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Beginning backfill migration: WhatsAppAccount.userId -> AccountAccess');

  // Find all mapped WhatsAppAccount sessions globally (or filter by active workspaces)
  const accountsToMigrate = await prisma.whatsAppAccount.findMany({
    where: {
      userId: { not: null },
      deletedAt: null,
    },
    select: {
      sessionId: true,
      workspaceId: true,
      userId: true,
    },
  });

  console.log(`Found ${accountsToMigrate.length} sessions with assigned users.`);

  let successCount = 0;
  let skipCount = 0;

  for (const account of accountsToMigrate) {
    if (!account.userId) continue;

    try {
      // Upsert to handle idempotency securely
      await prisma.accountAccess.upsert({
        where: {
          sessionId_userId: {
            sessionId: account.sessionId,
            userId: account.userId,
          },
        },
        update: {}, // Record exists, do nothing
        create: {
          workspaceId: account.workspaceId,
          sessionId: account.sessionId,
          userId: account.userId,
        },
      });
      successCount++;
    } catch (e: any) {
      if (e.code === 'P2002') {
        skipCount++; // Rare simultaneous insert wrapper
      } else {
        console.error(`Failed to migrate session ${account.sessionId}:`, e.message);
      }
    }
  }

  console.log(`\nBackfill complete.`);
  console.log(`- Inserted/Validated: ${successCount}`);
  console.log(`- Skipped/Failed: ${skipCount}\n`);
}

main()
  .catch((e) => {
    console.error('Fatal execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
