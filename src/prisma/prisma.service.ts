import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is required');
    }
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
