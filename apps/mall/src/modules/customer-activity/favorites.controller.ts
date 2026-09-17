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
} from '@nestjs/swagger';
import { CustomerActivityService } from './customer-activity.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { QueryFavoriteSelfDto } from './dto/query-favorite.dto';
import { FavoriteResponseDto } from './dto/favorite-response.dto';
import { ResponseUtil } from '@gvray/core';

import { CustomerJwtGuard } from '@/core/guards/customer-jwt.guard';
import { CurrentCustomer } from '@/core/decorators/current-customer.decorator';
import { ICustomer } from '@/core/interfaces/customer.interface';

/**
 * 客户收藏管理（B2C 登录态）。
 *
 * 客户身份取自 `@CurrentCustomer()`（CustomerJwtGuard 注入），
 * 不再由请求体/请求参数显式传 `customerId`，仅限当前客户本人操作。
 */
@ApiTags('客户收藏管理')
@ApiBearerAuth('JWT-auth')
@Controller('favorites')
@UseGuards(CustomerJwtGuard)
export class FavoritesController {
  constructor(private readonly activityService: CustomerActivityService) {}

  @Post()
  @ApiOperation({ summary: '收藏滤清器（幂等，仅限当前客户）' })
  @ApiResponse({
    status: 201,
    description: '收藏成功',
    type: FavoriteResponseDto,
  })
  @ApiBody({ type: CreateFavoriteDto })
  async create(
    @CurrentCustomer() customer: ICustomer,
    @Body() dto: CreateFavoriteDto,
  ) {
    const data = await this.activityService.createFavorite(
      customer.customerId,
      dto.filterId,
    );
    return ResponseUtil.created(data, '收藏成功');
  }

  @Get()
  @ApiOperation({ summary: '获取当前客户收藏列表' })
  @ApiResponse({ status: 200, description: '获取收藏列表成功' })
  async findAll(
    @CurrentCustomer() customer: ICustomer,
    @Query() query: QueryFavoriteSelfDto,
  ) {
    // 身份仅经 @CurrentCustomer 注入（P2-2：DTO 不再声明 customerId）
    const pageData = await this.activityService.findFavorites(
      customer.customerId,
      query,
    );
    return ResponseUtil.paginated(pageData, '获取收藏列表成功');
  }

  @Delete(':id')
  @ApiOperation({ summary: '按 favoriteId 删除单条收藏（仅限当前客户）' })
  @ApiResponse({ status: 200, description: '删除收藏成功' })
  async removeById(
    @CurrentCustomer() customer: ICustomer,
    @Param('id') id: string,
  ) {
    await this.activityService.removeFavoriteById(id, customer.customerId);
    return ResponseUtil.deleted(null, '删除收藏成功');
  }
}