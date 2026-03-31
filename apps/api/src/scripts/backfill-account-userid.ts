/**
 * Phase 7 — DB Backfill Script: Assign userId to orphaned WhatsAppAccount rows
 *
 * Background:
 *   The new architecture requires every WhatsAppAccount to have a `userId`
 *   (the human who created/owns it). Pre-migration rows have userId = null.
 *
 * Strategy (priority order):
 *   1. If the workspace has exactly ONE OWNER member → assign that owner.
 *   2. If the workspace has exactly ONE ADMIN member → assign that admin.
 *   3. If the workspace has any member → assign the earliest-joined one.
 *   4. Otherwise → log as unresolvable (manual fix required).
 *
 * Safety:
 *   - DRY_RUN=true (default) only prints what would change — no DB writes.
 *   - Set DRY_RUN=false in env to apply.
 *   - All updates run per-account so a single failure doesn't abort the rest.
 *   - Produces a clear audit report at the end.
 *
 * Usage:
 *   DRY_RUN=false npx ts-node src/scripts/backfill-account-userid.ts
 */

import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== 'false';

interface BackfillResult {
    accountId: string;
    sessionId: string;
    workspaceId: string;
    assignedUserId: string | null;
    strategy: string;
    status: 'APPLIED' | 'DRY_RUN' | 'UNRESOLVABLE' | 'SKIPPED';
}

async function resolveOwnerForWorkspace(workspaceId: string): Promise<{ userId: string; strategy: string } | null> {
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        orderBy: { joinedAt: 'asc' },
        select: { userId: true, role: true, joinedAt: true },
    });

    if (members.length === 0) return null;

    // Strategy 1: single OWNER
    const owners = members.filter(m => m.role === UserRole.OWNER);
    if (owners.length === 1) {
        return { userId: owners[0].userId, strategy: 'SINGLE_OWNER' };
    }

    // Strategy 2: single ADMIN
    const admins = members.filter(m => m.role === UserRole.ADMIN);
    if (admins.length === 1) {
        return { userId: admins[0].userId, strategy: 'SINGLE_ADMIN' };
    }

    // Strategy 3: earliest-joined member of any role
    return { userId: members[0].userId, strategy: 'EARLIEST_MEMBER' };
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  WhatsApp Account userId Backfill`);
    console.log(`  Mode: ${DRY_RUN ? '🔍 DRY_RUN (no writes)' : '✏️  LIVE (writing to DB)'}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Find all accounts without a userId (orphaned pre-migration rows)
    const orphaned = await prisma.whatsAppAccount.findMany({
        where: { userId: null, deletedAt: null },
        select: { id: true, sessionId: true, workspaceId: true, name: true },
        orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${orphaned.length} account(s) with userId = null\n`);

    if (orphaned.length === 0) {
        console.log('✅ Nothing to backfill. All accounts have a userId assigned.');
        return;
    }

    const results: BackfillResult[] = [];
    const workspaceCache = new Map<string, { userId: string; strategy: string } | null>();

    for (const account of orphaned) {
        let resolution = workspaceCache.get(account.workspaceId);
        if (resolution === undefined) {
            resolution = await resolveOwnerForWorkspace(account.workspaceId);
            workspaceCache.set(account.workspaceId, resolution);
        }

        if (!resolution) {
            console.warn(`  ⚠️  [UNRESOLVABLE] ${account.id} (${account.name}) — workspace ${account.workspaceId} has no members`);
            results.push({
                accountId: account.id,
                sessionId: account.sessionId,
                workspaceId: account.workspaceId,
                assignedUserId: null,
                strategy: 'NO_MEMBERS',
                status: 'UNRESOLVABLE',
            });
            continue;
        }

        if (!DRY_RUN) {
            try {
                await prisma.whatsAppAccount.update({
                    where: { id: account.id },
                    data: { userId: resolution.userId },
                });
                console.log(`  ✅ [APPLIED]  ${account.id} (${account.name}) → userId=${resolution.userId} via ${resolution.strategy}`);
                results.push({
                    accountId: account.id,
                    sessionId: account.sessionId,
                    workspaceId: account.workspaceId,
                    assignedUserId: resolution.userId,
                    strategy: resolution.strategy,
                    status: 'APPLIED',
                });
            } catch (err: any) {
                console.error(`  ❌ [ERROR]    ${account.id} — ${err.message}`);
                results.push({
                    accountId: account.id,
                    sessionId: account.sessionId,
                    workspaceId: account.workspaceId,
                    assignedUserId: resolution.userId,
                    strategy: resolution.strategy,
                    status: 'UNRESOLVABLE',
                });
            }
        } else {
            console.log(`  🔍 [DRY_RUN] ${account.id} (${account.name}) → would assign userId=${resolution.userId} via ${resolution.strategy}`);
            results.push({
                accountId: account.id,
                sessionId: account.sessionId,
                workspaceId: account.workspaceId,
                assignedUserId: resolution.userId,
                strategy: resolution.strategy,
                status: 'DRY_RUN',
            });
        }
    }

    // ── Summary Report ───────────────────────────────────────────
    const applied = results.filter(r => r.status === 'APPLIED').length;
    const dryRun  = results.filter(r => r.status === 'DRY_RUN').length;
    const unresol = results.filter(r => r.status === 'UNRESOLVABLE').length;

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Backfill Summary');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Total orphaned:   ${orphaned.length}`);
    console.log(`  Applied:          ${applied}`);
    console.log(`  Dry-run pending:  ${dryRun}`);
    console.log(`  Unresolvable:     ${unresol}`);
    if (unresol > 0) {
        console.log('\n  ⚠️  Unresolvable accounts require manual userId assignment.');
        console.log('  Run the following SQL to inspect them:');
        console.log(`  SELECT id, name, workspace_id FROM whatsapp_accounts WHERE user_id IS NULL AND deleted_at IS NULL;`);
    }
    console.log('═══════════════════════════════════════════════════════\n');
}

main()
    .catch(err => {
        console.error('Fatal error during backfill:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
