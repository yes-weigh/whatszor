const fs = require('fs');

let c = fs.readFileSync('d:/whatszor/apps/api/src/core/workers/inbound-message.worker.ts', 'utf8');

c = c.replace(/import \{ findMatchingAutoReply \} from '\.\.\/\.\.\/modules\/quick-replies\/quick-reply\.service';\r?\n/, '');
c = c.replace(/\/\/ Top-level import eliminates.*?\n.*?\n/, '');

const layer2Regex = /\/\/ ── LAYER 2: Legacy QuickReply \/ Auto-Reply \(Secondary Fallback\) ──[\s\S]*?\} \/\/ end if \(!autoReplied\) for QuickReply/;

c = c.replace(layer2Regex, '');

const layer1Start = c.indexOf(`// ── LAYER 1: Keyword Automation Engine (Primary Revenue Layer) ──`);
const aiFallbackStart = c.indexOf(`if (!autoReplied) {
                    await getQueue(QueueName.AI).add(\`ai-\${msg.key.id}\`, {`);

const newLayer1 = `// ── LAYER 1: Keyword Automation Engine (Primary Revenue Layer) ──
                try {
                    const kwMatch = await findMatchingKeywordAutomation(workspaceId, content);
                    if (kwMatch) {
                        const { automation, matchedKeyword } = kwMatch;
                        const contactIdentifier = conversation.contactId ?? conversation.providerId;

                        const autoIdempotencyKey = \`kw-auto:\${workspaceId}:\${msg.key.id}:\${automation.id}\`;
                        const alreadyHandled = await acquireIdempotencyLock(autoIdempotencyKey);

                        if (alreadyHandled === 'COMPLETED') {
                            log.info({ automationId: automation.id }, 'Keyword automation already handled — skipping');
                            autoReplied = true;
                        } else if (!isOnCooldown(workspaceId, contactIdentifier, matchedKeyword, automation.cooldownSec)) {
                            log.info({ keyword: matchedKeyword, matchType: automation.matchType, conversationId: conversation.id }, 'Keyword automation matched');
                            const startTime = Date.now();

                            if (automation.template) {
                                // Template Mode
                                const latestVersion = automation.template.versions?.[0];
                                if (latestVersion) {
                                    const templatePayload = {
                                        messageText: latestVersion.messageText,
                                        footerText: latestVersion.footerText ?? undefined,
                                        buttons: (latestVersion.buttons ?? []).map((b: any) => ({
                                            type: b.type,
                                            label: b.label,
                                            payload: b.payload,
                                        })),
                                        headerMediaId: latestVersion.media?.id ?? undefined,
                                        headerMediaType: latestVersion.media?.type?.toUpperCase() ?? undefined,
                                        headerFileName: latestVersion.media?.name ?? undefined,
                                    };

                                    const tplMsg = await prisma.message.create({
                                        data: {
                                            conversationId: conversation.id,
                                            workspaceId,
                                            direction: 'OUTBOUND',
                                            type: 'TEMPLATE',
                                            content: latestVersion.messageText,
                                            mediaData: { templatePayload } as any,
                                            status: 'QUEUED',
                                        },
                                    });
                                    await getQueue(QueueName.OUTBOUND_MESSAGES).add(\`kw-tpl-\${tplMsg.id}\`, {
                                        workspaceId,
                                        sessionId,
                                        messageId: tplMsg.id,
                                        toJid: providerId,
                                        type: 'TEMPLATE',
                                        content: latestVersion.messageText,
                                        mediaData: { templatePayload },
                                    });
                                } else {
                                    log.warn({ templateId: automation.templateId }, 'Keyword automation template has no versions — skipping');
                                }
                            } else {
                                // Standard Mode
                                if (automation.media?.id) {
                                    const mediaType = automation.media.type === 'image' ? 'IMAGE'
                                        : automation.media.type === 'video' ? 'VIDEO' : 'DOCUMENT';
                                    const mediaMsg = await prisma.message.create({
                                        data: {
                                            conversationId: conversation.id,
                                            workspaceId,
                                            direction: 'OUTBOUND',
                                            type: mediaType as any,
                                            content: null,
                                            mediaData: { mediaId: automation.media.id, fileName: automation.media.name } as any,
                                            status: 'QUEUED',
                                        },
                                    });
                                    await getQueue(QueueName.OUTBOUND_MESSAGES).add(
                                        \`kw-media-\${mediaMsg.id}\`,
                                        { workspaceId, sessionId, messageId: mediaMsg.id, toJid: providerId, type: mediaType, content: null, mediaData: { mediaId: automation.media.id, fileName: automation.media.name } },
                                    );
                                }

                                if (automation.replyText) {
                                    const textMsg = await prisma.message.create({
                                        data: {
                                            conversationId: conversation.id,
                                            workspaceId,
                                            direction: 'OUTBOUND',
                                            type: 'TEXT',
                                            content: automation.replyText,
                                            status: 'QUEUED',
                                        },
                                    });
                                    await getQueue(QueueName.OUTBOUND_MESSAGES).add(
                                        \`kw-text-\${textMsg.id}\`,
                                        { workspaceId, sessionId, messageId: textMsg.id, toJid: providerId, type: 'TEXT', content: automation.replyText, mediaData: null },
                                    );
                                }
                            }

                            setCooldown(workspaceId, contactIdentifier, matchedKeyword);

                            const execTime = Date.now() - startTime;
                            await logAutomationTrigger({
                                workspaceId,
                                automationId: automation.id,
                                keyword: matchedKeyword,
                                matchType: automation.matchType,
                                replyType: automation.template ? 'TEMPLATE' : 'STANDARD',
                                priority: automation.priority,
                                executionTimeMs: execTime,
                                contactId: conversation.contactId ?? null,
                                messageId: msg.key.id,
                            });

                            await completeIdempotency(autoIdempotencyKey);
                            autoReplied = true;
                        } else {
                            log.debug({ keyword: matchedKeyword, contactId: contactIdentifier }, 'Keyword automation suppressed by cooldown');
                            await releaseIdempotencyLock(autoIdempotencyKey);
                            autoReplied = true;
                        }
                    }
                } catch (kwErr) {
                    log.warn({ err: kwErr }, 'Keyword automation engine error');
                }
                
                `;

c = c.substring(0, layer1Start) + newLayer1 + c.substring(aiFallbackStart);

fs.writeFileSync('d:/whatszor/apps/api/src/core/workers/inbound-message.worker.ts', c);
