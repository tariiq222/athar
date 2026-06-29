import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccountProfileService } from './account-profile.service';
import { CreateAccountProfileDto } from './dto/create-account-profile.dto';
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { TenantContext } from '../tenant/tenant-context';

@Controller('accounts')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AccountProfileController {
  constructor(private readonly accounts: AccountProfileService) {}

  @Get()
  list(@CurrentTenant() ctx: TenantContext) {
    return this.accounts.listForTenant(ctx.tenantId);
  }

  @Post()
  @HttpCode(201)
  create(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateAccountProfileDto) {
    return this.accounts.createForTenant(ctx.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateAccountProfileDto,
  ) {
    return this.accounts.updateForTenant(ctx.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.accounts.deleteForTenant(ctx.tenantId, id);
  }
}
