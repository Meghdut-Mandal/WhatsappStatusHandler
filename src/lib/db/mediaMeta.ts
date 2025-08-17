import { prisma } from './client';
import { MediaMeta, Prisma } from '@prisma/client';

export interface CreateMediaMetaData {
  filename: string;
  originalName: string;
  mimetype: string;
  sizeBytes: number;
  storagePath: string;
  sha256?: string;
  duration?: number;
  width?: number;
  height?: number;
  isTemporary?: boolean;
}

export interface UpdateMediaMetaData {
  filename?: string;
  storagePath?: string;
  sha256?: string;
  duration?: number;
  width?: number;
  height?: number;
  isTemporary?: boolean;
}

export class MediaMetaService {
  /**
   * Create a new media meta record
   */
  static async create(data: CreateMediaMetaData): Promise<MediaMeta> {
    return prisma.mediaMeta.create({
      data: {
        filename: data.filename,
        originalName: data.originalName,
        mimetype: data.mimetype,
        sizeBytes: data.sizeBytes,
        storagePath: data.storagePath,
        sha256: data.sha256,
        duration: data.duration,
        width: data.width,
        height: data.height,
        isTemporary: data.isTemporary ?? true,
      },
    });
  }

  /**
   * Get media meta by ID
   */
  static async getById(id: string): Promise<MediaMeta | null> {
    return prisma.mediaMeta.findUnique({
      where: { id },
    });
  }

  /**
   * Get media meta by filename
   */
  static async getByFilename(filename: string): Promise<MediaMeta | null> {
    return prisma.mediaMeta.findFirst({
      where: { filename },
      orderBy: { tmpCreatedAt: 'desc' },
    });
  }

  /**
   * Get media meta by SHA256 hash
   */
  static async getBySha256(sha256: string): Promise<MediaMeta | null> {
    return prisma.mediaMeta.findFirst({
      where: { sha256 },
    });
  }

  /**
   * Get all media meta records
   */
  static async getAll(options?: {
    limit?: number;
    offset?: number;
    mimetype?: string;
    isTemporary?: boolean;
  }): Promise<MediaMeta[]> {
    const where: Prisma.MediaMetaWhereInput = {};
    
    if (options?.mimetype) {
      where.mimetype = { contains: options.mimetype };
    }
    
    if (options?.isTemporary !== undefined) {
      where.isTemporary = options.isTemporary;
    }

    return prisma.mediaMeta.findMany({
      where,
      orderBy: { tmpCreatedAt: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    });
  }

  /**
   * Get temporary files older than specified time
   */
  static async getTemporaryFiles(olderThanHours: number = 24): Promise<MediaMeta[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    return prisma.mediaMeta.findMany({
      where: {
        isTemporary: true,
        tmpCreatedAt: {
          lt: cutoffDate,
        },
      },
      orderBy: { tmpCreatedAt: 'asc' },
    });
  }

  /**
   * Update media meta
   */
  static async update(id: string, data: UpdateMediaMetaData): Promise<MediaMeta> {
    return prisma.mediaMeta.update({
      where: { id },
      data,
    });
  }

  /**
   * Mark as permanent (not temporary)
   */
  static async markPermanent(id: string): Promise<MediaMeta> {
    return this.update(id, { isTemporary: false });
  }

  /**
   * Get storage statistics
   */
  static async getStorageStats() {
    const [totalFiles, totalSize, temporaryFiles, temporarySize] = await Promise.all([
      prisma.mediaMeta.count(),
      prisma.mediaMeta.aggregate({
        _sum: { sizeBytes: true },
      }),
      prisma.mediaMeta.count({
        where: { isTemporary: true },
      }),
      prisma.mediaMeta.aggregate({
        where: { isTemporary: true },
        _sum: { sizeBytes: true },
      }),
    ]);

    return {
      totalFiles,
      totalSize: totalSize._sum.sizeBytes || 0,
      temporaryFiles,
      temporarySize: temporarySize._sum.sizeBytes || 0,
      permanentFiles: totalFiles - temporaryFiles,
      permanentSize: (totalSize._sum.sizeBytes || 0) - (temporarySize._sum.sizeBytes || 0),
    };
  }

  /**
   * Get media type statistics
   */
  static async getTypeStats() {
    const stats = await prisma.mediaMeta.groupBy({
      by: ['mimetype'],
      _count: { mimetype: true },
      _sum: { sizeBytes: true },
    });

    return stats.map((stat) => ({
      mimetype: stat.mimetype,
      count: stat._count.mimetype,
      totalSize: stat._sum.sizeBytes || 0,
    }));
  }

  /**
   * Delete media meta record
   */
  static async delete(id: string): Promise<void> {
    await prisma.mediaMeta.delete({
      where: { id },
    });
  }

  /**
   * Cleanup temporary files from database
   */
  static async cleanupTemporary(olderThanHours: number = 24): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    const result = await prisma.mediaMeta.deleteMany({
      where: {
        isTemporary: true,
        tmpCreatedAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Find duplicates by SHA256
   */
  static async findDuplicates(): Promise<{ sha256: string; files: MediaMeta[] }[]> {
    const duplicates = await prisma.mediaMeta.groupBy({
      by: ['sha256'],
      having: {
        sha256: {
          _count: {
            gt: 1,
          },
        },
      },
      _count: { sha256: true },
    });

    const duplicateGroups = await Promise.all(
      duplicates
        .filter((dup) => dup.sha256) // Only process non-null SHA256 values
        .map(async (dup) => {
          const files = await prisma.mediaMeta.findMany({
            where: { sha256: dup.sha256! },
          });
          return { sha256: dup.sha256!, files };
        })
    );

    return duplicateGroups;
  }

  /**
   * Count media meta records
   */
  static async count(where?: Prisma.MediaMetaWhereInput): Promise<number> {
    return prisma.mediaMeta.count({ where });
  }

  /**
   * Find many media meta records
   */
  static async findMany(args?: Prisma.MediaMetaFindManyArgs): Promise<MediaMeta[]> {
    return prisma.mediaMeta.findMany(args);
  }

  /**
   * Delete many media meta records
   */
  static async deleteMany(args: Prisma.MediaMetaDeleteManyArgs): Promise<Prisma.BatchPayload> {
    return prisma.mediaMeta.deleteMany(args);
  }
}
