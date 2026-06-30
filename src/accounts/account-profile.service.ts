import { Injectable } from '@nestjs/common';
import { AccountProfile } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountProfileDto } from './dto/create-account-profile.dto';
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto';
import { accountNotFound } from '../common/errors/error-envelope';

@Injectable()
export class AccountProfileService {
  constructor(private readonly prisma: PrismaService) {}

  listForTenant(tenantId: string): Promise<AccountProfile[]> {
    return this.prisma.accountProfile.findMany({ where: { tenantId } });
  }

  createForTenant(tenantId: string, dto: CreateAccountProfileDto): Promise<AccountProfile> {
    // tenantId comes ONLY from the verified context; any DTO tenantId is ignored.
    return this.prisma.accountProfile.create({
      data: {
        tenantId,
        brandProfileId: dto.brandProfileId,
        platform: dto.platform,
        ...(dto.handle !== undefined ? { handle: dto.handle } : {}),
      },
    });
  }

  async updateForTenant(
    tenantId: string,
    id: string,
    dto: UpdateAccountProfileDto,
  ): Promise<AccountProfile> {
    const existing = await this.prisma.accountProfile.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw accountNotFound();
    // id is the unique selector on the generated client; scope is already
    // enforced by the preceding findFirst.
    return this.prisma.accountProfile.update({
      where: { id },
      data: { handle: dto.handle },
    });
  }

  async deleteForTenant(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.accountProfile.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw accountNotFound();
    await this.prisma.accountProfile.delete({ where: { id } });
  }
}
