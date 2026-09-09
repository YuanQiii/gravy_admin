import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FiltersService, QueryFilterDto, FilterResponseDto } from '@gvray/domain';
import { Public, ResponseUtil } from '@gvray/core';

import { MALL_OPTS } from '../mall.constants';

@ApiTags('商城滤清器浏览')
@Controller('filters')
export class MallFiltersController {
  constructor(private readonly filtersService: FiltersService) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览滤清器列表',
    description: '公开接口，无需认证；强制 status=enabled + 加权排序',
  })
  @ApiResponse({ status: 200, description: '获取滤清器列表成功' })
  async findAll(@Query() query: QueryFilterDto) {
    const pageData = await this.filtersService.findAll(query, MALL_OPTS);
    return ResponseUtil.paginated(pageData, '获取滤清器列表成功');
  }

  @Get(':id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览滤清器详情',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({
    status: 200,
    description: '获取滤清器详情成功',
    type: FilterResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.filtersService.findOne(id, MALL_OPTS);
    return ResponseUtil.found(data, '获取滤清器详情成功');
  }
}