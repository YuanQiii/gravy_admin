import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BrandsService, QueryBrandDto, BrandResponseDto, HotBrandQueryDto } from '@gvray/domain';
import { Public, ResponseUtil } from '@gvray/core';

import { MALL_OPTS } from '../mall.constants';

@ApiTags('商城设备品牌浏览')
@Controller('brands')
export class MallBrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览设备品牌列表',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({ status: 200, description: '获取品牌列表成功' })
  async findAll(@Query() query: QueryBrandDto) {
    const pageData = await this.brandsService.findAll(query, MALL_OPTS);
    return ResponseUtil.paginated(pageData, '获取品牌列表成功');
  }

  @Get('hot')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览热门品牌列表',
    description: '公开接口，无需认证；运营标记优先、未标记按生效设备数补足',
  })
  @ApiResponse({ status: 200, description: '获取热门品牌列表成功' })
  async findHot(@Query() query: HotBrandQueryDto) {
    const data = await this.brandsService.findHot(query);
    return ResponseUtil.found(data, '获取热门品牌列表成功');
  }

  @Get(':id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览设备品牌详情',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({
    status: 200,
    description: '获取品牌详情成功',
    type: BrandResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.brandsService.findOne(id, MALL_OPTS);
    return ResponseUtil.found(data, '获取品牌详情成功');
  }
}