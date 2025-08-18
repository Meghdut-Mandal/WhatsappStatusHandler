import { prisma } from './client';
import type { Group, Prisma } from '@prisma/client';

export interface CreateGroupData {
  id: string;
  subject: string;
  description?: string;
  participantCount?: number;
  creation?: Date;
  owner?: string;
  userRole?: string;
  canSend?: boolean;
  isActive?: boolean;
  profilePicUrl?: string;
}

export interface UpdateGroupData {
  subject?: string;
  description?: string;
  participantCount?: number;
  creation?: Date;
  owner?: string;
  userRole?: string;
  canSend?: boolean;
  isActive?: boolean;
  profilePicUrl?: string;
  lastSyncAt?: Date;
}

export interface GroupFilters {
  isActive?: boolean;
  userRole?: string;
  canSend?: boolean;
  minParticipants?: number;
  maxParticipants?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface GroupStatistics {
  total: number;
  active: number;
  adminGroups: number;
  ownedGroups: number;
  averageParticipants: number;
}

export class GroupRepository {
  static async findAll(filters: GroupFilters = {}): Promise<Group[]> {
    const where: Prisma.GroupWhereInput = {};
    
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    
    if (filters.userRole) {
      where.userRole = filters.userRole;
    }
    
    if (filters.canSend !== undefined) {
      where.canSend = filters.canSend;
    }
    
    if (filters.minParticipants !== undefined || filters.maxParticipants !== undefined) {
      where.participantCount = {};
      if (filters.minParticipants !== undefined) {
        where.participantCount.gte = filters.minParticipants;
      }
      if (filters.maxParticipants !== undefined) {
        where.participantCount.lte = filters.maxParticipants;
      }
    }
    
    if (filters.search) {
      where.OR = [
        { subject: { contains: filters.search } },
        { description: { contains: filters.search } }
      ];
    }

    return prisma.group.findMany({
      where,
      orderBy: [
        { userRole: 'desc' },
        { participantCount: 'desc' },
        { subject: 'asc' }
      ],
      take: filters.limit,
      skip: filters.offset
    });
  }

  static async findById(id: string): Promise<Group | null> {
    return prisma.group.findUnique({
      where: { id }
    });
  }

  static async create(data: CreateGroupData): Promise<Group> {
    return prisma.group.create({
      data: {
        ...data,
        lastSyncAt: new Date()
      }
    });
  }

  static async update(id: string, data: UpdateGroupData): Promise<Group> {
    return prisma.group.update({
      where: { id },
      data: {
        ...data,
        lastSyncAt: new Date()
      }
    });
  }

  static async upsert(data: CreateGroupData): Promise<Group> {
    return prisma.group.upsert({
      where: { id: data.id },
      create: {
        ...data,
        lastSyncAt: new Date()
      },
      update: {
        ...data,
        lastSyncAt: new Date()
      }
    });
  }

  static async markInactive(id: string): Promise<Group> {
    return prisma.group.update({
      where: { id },
      data: {
        isActive: false,
        lastSyncAt: new Date()
      }
    });
  }

  static async getStatistics(): Promise<GroupStatistics> {
    const [total, active, adminGroups, ownedGroups, avgResult] = await Promise.all([
      prisma.group.count(),
      prisma.group.count({ where: { isActive: true } }),
      prisma.group.count({ where: { userRole: { in: ['admin', 'superadmin'] } } }),
      prisma.group.count({ where: { userRole: 'superadmin' } }),
      prisma.group.aggregate({
        _avg: {
          participantCount: true
        }
      })
    ]);

    return {
      total,
      active,
      adminGroups,
      ownedGroups,
      averageParticipants: Math.round(avgResult._avg.participantCount || 0)
    };
  }

  static async deleteAll(): Promise<void> {
    await prisma.group.deleteMany();
  }
}