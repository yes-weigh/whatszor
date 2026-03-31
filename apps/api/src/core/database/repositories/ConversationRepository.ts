import { Prisma, Conversation } from '@prisma/client';
import { prisma } from '../../../prisma/client';
import { UserContext } from '../types';
import { SessionNotFoundError } from '@whatszor/shared';
import { WhatsAppAccountRepository } from './WhatsAppAccountRepository';

export class ConversationRepository {
  /**
   * Generates the mandatory base query to securely scope records to the active tenant/user.
   * Enforces Soft Delete (deletedAt: null).
   */
  private static getTenantScope(ctx: UserContext): Prisma.ConversationWhereInput {
    const scope: Prisma.ConversationWhereInput = {
      workspaceId: ctx.workspaceId,
      deletedAt: null,
    };

    // Members can strictly only access Conversations linked to their own WhatsApp accounts
    if (ctx.role === 'MEMBER') {
       scope.whatsAppAccount = {
           userId: ctx.userId,
           deletedAt: null
       }
    }

    return scope;
  }

  static async findByIdOrThrow(ctx: UserContext, id: string): Promise<Conversation> {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        ...this.getTenantScope(ctx),
      },
    });

    if (!conversation) {
      throw new SessionNotFoundError('Conversation not found or access denied');
    }

    return conversation;
  }

  static async list(
    ctx: UserContext,
    whereProps?: Omit<Prisma.ConversationWhereInput, 'workspaceId' | 'deletedAt'>,
    pagination?: { take?: number; cursor?: Prisma.ConversationWhereUniqueInput; skip?: number }
  ): Promise<Conversation[]> {
    return prisma.conversation.findMany({
      where: {
        ...this.getTenantScope(ctx),
        ...whereProps,
      },
      ...pagination,
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  static async create(
    ctx: UserContext,
    data: Prisma.ConversationUncheckedCreateInput 
  ): Promise<Conversation> {
    // Before creating, guarantee they own the WhatsApp Account linked to this session
    if (data.sessionId) {
        await WhatsAppAccountRepository.findBySessionIdOrThrow(ctx, data.sessionId);
    }

    return prisma.conversation.create({
      data: {
        ...data,
        workspaceId: ctx.workspaceId,
      },
    });
  }

  static async update(
    ctx: UserContext,
    id: string,
    data: Prisma.ConversationUpdateInput
  ): Promise<Conversation> {
    // Ensure existence & authority first
    await this.findByIdOrThrow(ctx, id);

    return prisma.conversation.update({
      where: { id },
      data,
    });
  }

  static async softDelete(ctx: UserContext, id: string): Promise<Conversation> {
     // Ensure existence & authority first
     await this.findByIdOrThrow(ctx, id);

     return prisma.conversation.update({
         where: { id },
         data: { deletedAt: new Date() }
     });
  }
}
