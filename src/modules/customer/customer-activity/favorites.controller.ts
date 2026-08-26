import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { CustomerActivityService } from './customer-activity.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { QueryFavoriteDto } from './dto/query-favorite.dto';
import { FavoriteResponseDto } from './dto/favorite-response.dto';
import { RequirePermissions } from '@/core/decorators/permissions.decorator';
import { OperationLog } from '@/core/decorators/operation-log.decorator';
import { ResponseUtil } from '@/shared/utils/response.util';
import { CUSTOMER_FAVORITE_PERMISSIONS } from '@/shared/constants/permissions.constant';
import { JwtAuthGuard } from '@/core/guards/jwt-auth.guard';
import { GuestWriteGuard } from '@/core/guards/guest-write.guard';
import { RolesGuard } from '@/core/guards/roles.guard';
import { PermissionsGuard } from '@/core/guards/permissions.guard';

@ApiTags('客户收藏管理')
@ApiBearerAuth('JWT-auth')
@Controller('customer/favorites')
@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)
export class FavoritesController {
  constructor(private readonly activityService: CustomerActivityService) {}

  @Post()
  @RequirePermissions(CUSTOMER_FAVORITE_PERMISSIONS.CREATE)
  @OperationLog({ module: '客户收藏管理' })
  @ApiOperation({ summary: '收藏滤清器（幂等）' })
  @ApiResponse({
    status: 201,
    description: '收藏成功',
    type: FavoriteResponseDto,
  })
  @ApiBody({ type: CreateFavoriteDto })
  async create(@Body() dto: CreateFavoriteDto) {
    const data = await this.activityService.createFavorite(
      dto.customerId,
      dto.filterId,
    );
    return ResponseUtil.created(data, '收藏成功');
  }

  @Get()
  @RequirePermissions(CUSTOMER_FAVORITE_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取客户收藏列表' })
  @ApiResponse({ status: 200, description: '获取收藏列表成功' })
  async findAll(@Query() query: QueryFavoriteDto) {
    const pageData = await this.activityService.findFavorites(query);
    return ResponseUtil.paginated(pageData, '获取收藏列表成功');
  }

  @Delete()
  @RequirePermissions(CUSTOMER_FAVORITE_PERMISSIONS.DELETE)
  @OperationLog({ module: '客户收藏管理', action: 'delete' })
  @ApiOperation({ summary: '按客户+滤清器取消收藏（幂等）' })
  @ApiQuery({ name: 'customerId', description: '客户ID（customerId UUID）' })
  @ApiQuery({ name: 'filterId', description: '滤清器ID（filterId UUID）' })
  @ApiResponse({ status: 200, description: '取消收藏成功' })
  async remove(
    @Query('customerId') customerId: string,
    @Query('filterId') filterId: string,
  ) {
    await this.activityService.removeFavorite(customerId, filterId);
    return ResponseUtil.deleted(null, '取消收藏成功');
  }

  @Delete(':id')
  @RequirePermissions(CUSTOMER_FAVORITE_PERMISSIONS.DELETE)
  @OperationLog({ module: '客户收藏管理', action: 'delete' })
  @ApiOperation({ summary: '按 favoriteId 删除单条收藏' })
  @ApiResponse({ status: 200, description: '删除收藏成功' })
  async removeById(@Param('id') id: string) {
    await this.activityService.removeFavoriteById(id);
    return ResponseUtil.deleted(null, '删除收藏成功');
  }
}
