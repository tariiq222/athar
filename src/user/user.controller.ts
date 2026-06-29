import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { DeleteMeDto } from './dto/delete-me.dto';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { TenantContext } from '../tenant/tenant-context';

@Controller('me')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  me(@CurrentTenant() ctx: TenantContext) {
    return this.users.me(ctx);
  }

  @Post('export')
  @HttpCode(200)
  export(@CurrentTenant() ctx: TenantContext) {
    return this.users.exportData(ctx);
  }

  @Delete()
  @HttpCode(202)
  remove(@CurrentTenant() ctx: TenantContext, @Body() dto: DeleteMeDto) {
    return this.users.softDelete(ctx, dto);
  }
}