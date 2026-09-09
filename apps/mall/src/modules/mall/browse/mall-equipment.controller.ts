import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EquipmentService, QueryEquipmentDto, EquipmentResponseDto } from '@gvray/domain';
import { Public, ResponseUtil } from '@gvray/core';

import { MALL_OPTS } from '../mall.constants';

@ApiTags('商城设备档案浏览')
@Controller('equipment')
export class MallEquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览设备档案列表',
    description: '公开接口，无需认证；强制 status=enabled + 加权排序',
  })
  @ApiResponse({ status: 200, description: '获取设备档案列表成功' })
  async findAll(@Query() query: QueryEquipmentDto) {
    const pageData = await this.equipmentService.findAll(query, MALL_OPTS);
    return ResponseUtil.paginated(pageData, '获取设备档案列表成功');
  }

  @Get(':id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览设备档案详情',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({
    status: 200,
    description: '获取设备档案详情成功',
    type: EquipmentResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.equipmentService.findOne(id, MALL_OPTS);
    return ResponseUtil.found(data, '获取设备档案详情成功');
  }
}