import { Prisma, WhatsAppAccount, SessionStatus } from '@prisma/client';
import { prisma } from '../../../prisma/client';
import { UserContext } from '../types';
import { SessionNotFoundError, SessionOwnershipError } from '@whatszor/shared';

export class WhatsAppAccountRepository {
  /**
   * Generates the mandatory base query to securely scope records to the active tenant/user.
   * Enforces Soft Delete (deletedAt: null).
   */
  private static getTenantScope(ctx: UserContext): Prisma.WhatsAppAccountWhereInput {
    const scope: Prisma.WhatsAppAccountWhereInput = {
      workspaceId: ctx.workspaceId,
      deletedAt: null,
    };

    // Members can strictly only access WhatsApp accounts they own.
    if (ctx.role === 'MEMBER') {
      scope.userId = ctx.userId;
    }

    return scope;
  }

  static async findByIdOrThrow(ctx: UserContext, id: string): Promise<WhatsAppAccount> {
    const account = await prisma.whatsAppAccount.findFirst({
      where: {
        id,
        ...this.getTenantScope(ctx),
      },
    });

    if (!account) {
      // Check if it exists globally in the workspace to differentiate not found vs forbidden
      const exists = await prisma.whatsAppAccount.findFirst({
          where: { id, workspaceId: ctx.workspaceId, deletedAt: null }
      });
      if (exists) {
          throw new SessionOwnershipError();
      }
      throw new SessionNotFoundError();
    }

    return account;
  }

  static async findBySessionIdOrThrow(ctx: UserContext, sessionId: string): Promise<WhatsAppAccount> {
    const account = await prisma.whatsAppAccount.findFirst({
      where: {
        sessionId,
        ...this.getTenantScope(ctx),
      },
    });

    if (!account) {
      // Check if it exists globally in the workspace to differentiate not found vs forbidden
      const exists = await prisma.whatsAppAccount.findFirst({
          where: { sessionId, workspaceId: ctx.workspaceId, deletedAt: null }
      });
      if (exists) {
          throw new SessionOwnershipError();
      }
      throw new SessionNotFoundError();
    }

    return account;
  }

  static async list(
    ctx: UserContext,
    whereProps?: Omit<Prisma.WhatsAppAccountWhereInput, 'workspaceId' | 'deletedAt'>
  ): Promise<WhatsAppAccount[]> {
    return prisma.whatsAppAccount.findMany({
      where: {
        ...this.getTenantScope(ctx),
        ...whereProps, // Only allow safe explicit extra filters
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async create(
    ctx: UserContext,
    data: Omit<Prisma.WhatsAppAccountUncheckedCreateInput, 'workspaceId' | 'userId' | 'deletedAt'>
  ): Promise<WhatsAppAccount> {
    return prisma.whatsAppAccount.create({
      data: {
        ...data,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId, // The creator is permanently the owner
      },
    });
  }

  static async update(
    ctx: UserContext,
    id: string,
    data: Prisma.WhatsAppAccountUpdateInput
  ): Promise<WhatsAppAccount> {
    // Ensure existence & authority first
    await this.findByIdOrThrow(ctx, id);

    return prisma.whatsAppAccount.update({
      where: { id },
      data,
    });
  }

  static async softDelete(ctx: UserContext, id: string): Promise<WhatsAppAccount> {
     // Ensure existence & authority first
     await this.findByIdOrThrow(ctx, id);

     return prisma.whatsAppAccount.update({
         where: { id },
         data: { deletedAt: new Date(), status: SessionStatus.DISCONNECTED }
     });
  }

  /**
   * System-level method for boot-up sequence only.
   * Restores all active sessions across the platform.
   */
  static async getActiveSessionsForBoot(): Promise<WhatsAppAccount[]> {
      return prisma.whatsAppAccount.findMany({
          where: { 
              status: { not: SessionStatus.DISCONNECTED },
              deletedAt: null
          }
      });
  }

  /**
   * System-level method for restoring workspace specific sessions on boot/resync.
   */
  static async getWorkspaceSessionsForBoot(workspaceId: string): Promise<WhatsAppAccount[]> {
      return prisma.whatsAppAccount.findMany({
          where: {
              workspaceId,
              deletedAt: null
          }
      });
  }
}

