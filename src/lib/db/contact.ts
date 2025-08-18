import { prisma } from './client';
import type { Contact, Prisma } from '@prisma/client';

export interface CreateContactData {
  id: string;
  name?: string;
  pushName?: string;
  notify?: string;
  verifiedName?: string;
  status?: string;
  phoneNumber?: string;
  isBusiness?: boolean;
  isMyContact?: boolean;
  isBlocked?: boolean;
  isActive?: boolean;
  isFavorite?: boolean;
  profilePicUrl?: string;
  lastSeen?: Date;
}

export interface UpdateContactData {
  name?: string;
  pushName?: string;
  notify?: string;
  verifiedName?: string;
  status?: string;
  phoneNumber?: string;
  isBusiness?: boolean;
  isMyContact?: boolean;
  isBlocked?: boolean;
  isActive?: boolean;
  isFavorite?: boolean;
  profilePicUrl?: string;
  lastSeen?: Date;
  lastSyncAt?: Date;
}

export interface ContactFilters {
  isActive?: boolean;
  isFavorite?: boolean;
  isBusiness?: boolean;
  isMyContact?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ContactStatistics {
  total: number;
  active: number;
  favorites: number;
  business: number;
  myContacts: number;
}

export class ContactRepository {
  static async findAll(filters: ContactFilters = {}): Promise<Contact[]> {
    const where: Prisma.ContactWhereInput = {};
    
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    
    if (filters.isFavorite !== undefined) {
      where.isFavorite = filters.isFavorite;
    }
    
    if (filters.isBusiness !== undefined) {
      where.isBusiness = filters.isBusiness;
    }
    
    if (filters.isMyContact !== undefined) {
      where.isMyContact = filters.isMyContact;
    }
    
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { pushName: { contains: filters.search } },
        { phoneNumber: { contains: filters.search } },
        { notify: { contains: filters.search } }
      ];
    }

    return prisma.contact.findMany({
      where,
      orderBy: [
        { isFavorite: 'desc' },
        { name: 'asc' },
        { pushName: 'asc' }
      ],
      take: filters.limit,
      skip: filters.offset
    });
  }

  static async findById(id: string): Promise<Contact | null> {
    return prisma.contact.findUnique({
      where: { id }
    });
  }

  static async create(data: CreateContactData): Promise<Contact> {
    return prisma.contact.create({
      data: {
        ...data,
        lastSyncAt: new Date()
      }
    });
  }

  static async update(id: string, data: UpdateContactData): Promise<Contact> {
    return prisma.contact.update({
      where: { id },
      data: {
        ...data,
        lastSyncAt: new Date()
      }
    });
  }

  static async upsert(data: CreateContactData): Promise<Contact> {
    return prisma.contact.upsert({
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

  static async markInactive(id: string): Promise<Contact> {
    return prisma.contact.update({
      where: { id },
      data: {
        isActive: false,
        lastSyncAt: new Date()
      }
    });
  }

  static async toggleFavorite(id: string): Promise<Contact> {
    const contact = await prisma.contact.findUnique({
      where: { id }
    });
    
    if (!contact) {
      throw new Error(`Contact with id ${id} not found`);
    }

    return prisma.contact.update({
      where: { id },
      data: {
        isFavorite: !contact.isFavorite
      }
    });
  }

  static async getStatistics(): Promise<ContactStatistics> {
    const [total, active, favorites, business, myContacts] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { isActive: true } }),
      prisma.contact.count({ where: { isFavorite: true } }),
      prisma.contact.count({ where: { isBusiness: true } }),
      prisma.contact.count({ where: { isMyContact: true } })
    ]);

    return {
      total,
      active,
      favorites,
      business,
      myContacts
    };
  }

  static async deleteAll(): Promise<void> {
    await prisma.contact.deleteMany();
  }
}