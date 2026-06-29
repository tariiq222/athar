import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { TenantContext } from '../tenant/tenant-context';
import { PostService } from './post.service';
import { ListPostsDto } from './dto/list-posts.dto';
import { PatchPostDto } from './dto/patch-post.dto';
import { PostDetail } from './post.types';

@Controller('posts')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PostController {
  constructor(private readonly posts: PostService) {}

  @Get()
  async list(
    @CurrentTenant() ctx: TenantContext,
    @Query() query: ListPostsDto,
  ) {
    return this.posts.list(ctx.tenantId, query);
  }

  @Patch(':id')
  async patch(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: PatchPostDto,
  ): Promise<PostDetail> {
    return this.posts.patch(ctx.tenantId, id, body);
  }
}
