import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { BrandProfile } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant, TenantContext } from '../tenant/current-tenant.decorator';
import { OnboardingService } from './onboarding.service';
import { OnboardingInputDto } from './dto/onboarding-input.dto';
import { BrandProfileDraftDto } from './dto/brand-profile-draft.dto';
import { PatchBrandProfileDraftDto } from './dto/patch-brand-profile.dto';
import { errorEnvelope } from '../common/dto-validation';
import type { AnalyzeResponse } from './types';

@Controller('brand')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BrandController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly prisma: PrismaService,
  ) {}

  // FR-1: analyze + questions in one response so the UI starts confirmation immediately.
  @Post('analyze')
  async analyze(
    @Body() input: OnboardingInputDto,
    @CurrentTenant() ctx: TenantContext,
  ): Promise<AnalyzeResponse> {
    const analysis = await this.onboarding.analyze(input, ctx.tenantId);
    const questions = this.onboarding.buildQuestions(analysis);
    return { analysis, questions };
  }

  // FR-2/FR-3: create the profile from the customer-confirmed draft.
  @Post('profile')
  async create(
    @Body() draft: BrandProfileDraftDto,
    @CurrentTenant() ctx: TenantContext,
  ): Promise<BrandProfile> {
    return this.onboarding.commit(draft, ctx.tenantId, draft.accounts);
  }

  // FR-3: read the profile as a reference/context.
  @Get('profile/:id')
  async get(
    @Param('id') id: string,
    @CurrentTenant() ctx: TenantContext,
  ): Promise<BrandProfile> {
    return this.findInTenantOr404(id, ctx.tenantId);
  }

  // US-2.3: partial edit; topics re-edit is the official axis-reset path (AC-6).
  @Patch('profile/:id')
  async patch(
    @Param('id') id: string,
    @Body() patch: PatchBrandProfileDraftDto,
    @CurrentTenant() ctx: TenantContext,
  ): Promise<BrandProfile> {
    await this.findInTenantOr404(id, ctx.tenantId);
    const data: Record<string, unknown> = {};
    if (patch.tone !== undefined) data.tone = patch.tone;
    if (patch.audience !== undefined) data.audience = patch.audience;
    if (patch.goals !== undefined) data.goals = patch.goals;
    if (patch.topics !== undefined) data.topics = patch.topics;
    if (patch.prohibitions !== undefined) data.prohibitions = patch.prohibitions;
    if (patch.competitors !== undefined) data.competitors = patch.competitors;
    if (patch.keywords !== undefined) data.keywords = patch.keywords;
    if (patch.brandKit !== undefined) data.brandKit = patch.brandKit as object;
    return this.prisma.brandProfile.update({ where: { id }, data });
  }

  // AC-7: scope by tenantId; a row outside the tenant is indistinguishable from a missing one.
  private async findInTenantOr404(id: string, tenantId: string): Promise<BrandProfile> {
    const profile = await this.prisma.brandProfile.findFirst({ where: { id, tenantId } });
    if (!profile) {
      throw new NotFoundException(errorEnvelope('not_found', 'الملف غير موجود'));
    }
    return profile;
  }
}
