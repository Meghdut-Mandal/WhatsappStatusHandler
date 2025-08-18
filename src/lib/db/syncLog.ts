import { prisma } from './client';
import type { SyncLog, Prisma } from '@prisma/client';

export interface CreateSyncLogData {
  type: 'contacts' | 'groups' | 'full';
  status: 'started' | 'completed' | 'failed';
  itemsCount?: number;
  errorMessage?: string;
}

export interface UpdateSyncLogData {
  status?: 'started' | 'completed' | 'failed';
  itemsCount?: number;
  errorMessage?: string;
  completedAt?: Date;
}

export interface SyncLogFilters {
  type?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class SyncLogRepository {
  static async findAll(filters: SyncLogFilters = {}): Promise<SyncLog[]> {
    const where: Prisma.SyncLogWhereInput = {};
    
    if (filters.type) {
      where.type = filters.type;
    }
    
    if (filters.status) {
      where.status = filters.status;
    }
    
    if (filters.startDate || filters.endDate) {
      where.startedAt = {};
      if (filters.startDate) {
        where.startedAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.startedAt.lte = filters.endDate;
      }
    }

    return prisma.syncLog.findMany({
      where,
      orderBy: {
        startedAt: 'desc'
      },
      take: filters.limit,
      skip: filters.offset
    });
  }

  static async findById(id: string): Promise<SyncLog | null> {
    return prisma.syncLog.findUnique({
      where: { id }
    });
  }

  static async create(data: CreateSyncLogData): Promise<SyncLog> {
    return prisma.syncLog.create({
      data
    });
  }

  static async update(id: string, data: UpdateSyncLogData): Promise<SyncLog> {
    return prisma.syncLog.update({
      where: { id },
      data
    });
  }

  static async markCompleted(id: string, itemsCount?: number): Promise<SyncLog> {
    return prisma.syncLog.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        itemsCount
      }
    });
  }

  static async markFailed(id: string, errorMessage: string): Promise<SyncLog> {
    return prisma.syncLog.update({
      where: { id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage
      }
    });
  }

  static async getLatestByType(type: string): Promise<SyncLog | null> {
    return prisma.syncLog.findFirst({
      where: { type },
      orderBy: {
        startedAt: 'desc'
      }
    });
  }

  static async cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.syncLog.deleteMany({
      where: {
        startedAt: {
          lt: cutoffDate
        }
      }
    });

    return result.count;
  }

  static async getStatistics() {
    const [total, completed, failed, recent] = await Promise.all([
      prisma.syncLog.count(),
      prisma.syncLog.count({ where: { status: 'completed' } }),
      prisma.syncLog.count({ where: { status: 'failed' } }),
      prisma.syncLog.count({
        where: {
          startedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      })
    ]);

    return {
      total,
      completed,
      failed,
      recent
    };
  }
}