import { prisma } from './client';
import { SendHistory, Prisma } from '@prisma/client';

export interface CreateSendHistoryData {
  sessionId: string;
  targetType: 'status' | 'contact' | 'group';
  targetIdentifier?: string;
  files: string[]; // Array of file paths/info
  status?: 'pending' | 'uploading' | 'sending' | 'completed' | 'failed';
}

export interface UpdateSendHistoryData {
  status?: 'pending' | 'uploading' | 'sending' | 'completed' | 'failed';
  completedAt?: Date;
  errorMessage?: string;
  files?: string[];
}

export class SendHistoryService {
  /**
   * Create a new send history record
   */
  static async create(data: CreateSendHistoryData): Promise<SendHistory> {
    return prisma.sendHistory.create({
      data: {
        sessionId: data.sessionId,
        targetType: data.targetType,
        targetIdentifier: data.targetIdentifier,
        files: JSON.stringify(data.files),
        status: data.status || 'pending',
      },
      include: {
        session: true,
      },
    });
  }

  /**
   * Get send history by ID
   */
  static async getById(id: string): Promise<SendHistory | null> {
    const history = await prisma.sendHistory.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (history) {
      return {
        ...history,
        files: JSON.parse(history.files),
      };
    }

    return null;
  }

  /**
   * Get all send history for a session
   */
  static async getBySessionId(
    sessionId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
    }
  ): Promise<SendHistory[]> {
    const where: Prisma.SendHistoryWhereInput = {
      sessionId,
      ...(options?.status && { status: options.status }),
    };

    const history = await prisma.sendHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
      skip: options?.offset,
      include: {
        session: true,
      },
    });

    return history.map((item) => ({
      ...item,
      files: JSON.parse(item.files),
    }));
  }

  /**
   * Get recent send history
   */
  static async getRecent(limit: number = 50): Promise<SendHistory[]> {
    const history = await prisma.sendHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        session: true,
      },
    });

    return history.map((item) => ({
      ...item,
      files: JSON.parse(item.files),
    }));
  }

  /**
   * Update send history
   */
  static async update(id: string, data: UpdateSendHistoryData): Promise<SendHistory> {
    const updateData: any = { ...data };
    
    if (data.files) {
      updateData.files = JSON.stringify(data.files);
    }

    const history = await prisma.sendHistory.update({
      where: { id },
      data: updateData,
      include: {
        session: true,
      },
    });

    return {
      ...history,
      files: JSON.parse(history.files),
    };
  }

  /**
   * Mark as completed
   */
  static async markCompleted(id: string): Promise<SendHistory> {
    return this.update(id, {
      status: 'completed',
      completedAt: new Date(),
    });
  }

  /**
   * Mark as failed
   */
  static async markFailed(id: string, errorMessage: string): Promise<SendHistory> {
    return this.update(id, {
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    });
  }

  /**
   * Get statistics
   */
  static async getStats(sessionId?: string) {
    const where = sessionId ? { sessionId } : {};

    const [total, completed, failed, pending] = await Promise.all([
      prisma.sendHistory.count({ where }),
      prisma.sendHistory.count({ where: { ...where, status: 'completed' } }),
      prisma.sendHistory.count({ where: { ...where, status: 'failed' } }),
      prisma.sendHistory.count({ where: { ...where, status: 'pending' } }),
    ]);

    return {
      total,
      completed,
      failed,
      pending,
      successRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }

  /**
   * Delete old records
   */
  static async cleanup(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.sendHistory.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        status: {
          in: ['completed', 'failed'],
        },
      },
    });

    return result.count;
  }

  /**
   * Delete send history record
   */
  static async delete(id: string): Promise<void> {
    await prisma.sendHistory.delete({
      where: { id },
    });
  }
}
