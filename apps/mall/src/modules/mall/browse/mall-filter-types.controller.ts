import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FilterTypesService, QueryFilterTypeDto, FilterTypeResponseDto } from '@gvray/domain';
import { Public, ResponseUtil } from '@gvray/core';

import { MALL_OPTS } from '../mall.constants';

@ApiTags('商城滤清器类型浏览')
@Controller('filter-types')
export class MallFilterTypesController {
  constructor(private readonly filterTypesService: FilterTypesService) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览滤清器类型列表',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({ status: 200, description: '获取滤清器类型列表成功' })
  async findAll(@Query() query: QueryFilterTypeDto) {
    const pageData = await this.filterTypesService.findAll(query, MALL_OPTS);
    return ResponseUtil.paginated(pageData, '获取滤清器类型列表成功');
  }

  @Get('options')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览启用的滤清器类型下拉选项',
    description: '公开接口，无需认证',
  })
  @ApiResponse({ status: 200, description: '获取下拉选项成功' })
  async findOptions() {
    const data = await this.filterTypesService.findAllEnabled();
    return ResponseUtil.found(data, '获取下拉选项成功');
  }

  @Get(':id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览滤清器类型详情',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({
    status: 200,
    description: '获取滤清器类型详情成功',
    type: FilterTypeResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.filterTypesService.findOne(id, MALL_OPTS);
    return ResponseUtil.found(data, '获取滤清器类型详情成功');
  }
}