import { prisma } from './client';
import { Session, Prisma } from '@prisma/client';
import { encrypt, decrypt } from './crypto';

export interface CreateSessionData {
  deviceName: string;
  authBlob?: string;
}

export interface UpdateSessionData {
  deviceName?: string;
  authBlob?: string;
  lastSeenAt?: Date;
  isActive?: boolean;
}

export class SessionService {
  /**
   * Create a new session
   */
  static async create(data: CreateSessionData): Promise<Session> {
    const encryptedAuthBlob = data.authBlob ? await encrypt(data.authBlob) : null;
    
    return prisma.session.create({
      data: {
        deviceName: data.deviceName,
        authBlob: encryptedAuthBlob,
        isActive: true,
      },
    });
  }

  /**
   * Get session by ID
   */
  static async getById(id: string): Promise<Session | null> {
    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (session?.authBlob) {
      return {
        ...session,
        authBlob: await decrypt(session.authBlob),
      };
    }

    return session;
  }

  /**
   * Get active session
   */
  static async getActive(): Promise<Session | null> {
    const session = await prisma.session.findFirst({
      where: { isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    });

    if (session?.authBlob) {
      return {
        ...session,
        authBlob: await decrypt(session.authBlob),
      };
    }

    return session;
  }

  /**
   * Get all sessions
   */
  static async getAll(): Promise<Session[]> {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      sessions.map(async (session) => ({
        ...session,
        authBlob: session.authBlob ? await decrypt(session.authBlob) : null,
      }))
    );
  }

  /**
   * Update session
   */
  static async update(id: string, data: UpdateSessionData): Promise<Session> {
    const updateData: any = { ...data };
    
    if (data.authBlob) {
      updateData.authBlob = await encrypt(data.authBlob);
    }

    const session = await prisma.session.update({
      where: { id },
      data: updateData,
    });

    if (session.authBlob) {
      return {
        ...session,
        authBlob: await decrypt(session.authBlob),
      };
    }

    return session;
  }

  /**
   * Update last seen time
   */
  static async updateLastSeen(id: string): Promise<Session> {
    return prisma.session.update({
      where: { id },
      data: {
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * Deactivate all sessions
   */
  static async deactivateAll(): Promise<void> {
    await prisma.session.updateMany({
      data: { isActive: false },
    });
  }

  /**
   * Delete session
   */
  static async delete(id: string): Promise<void> {
    await prisma.session.delete({
      where: { id },
    });
  }

  /**
   * Get session with send history
   */
  static async getWithHistory(id: string): Promise<Session & { sendHistory: any[] } | null> {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        sendHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (session?.authBlob) {
      return {
        ...session,
        authBlob: await decrypt(session.authBlob),
      };
    }

    return session;
  }
}
