import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EquipmentService } from '@/modules/equipment/equipment/equipment.service';
import { QueryEquipmentDto } from '@/modules/equipment/equipment/dto/query-equipment.dto';
import { EquipmentResponseDto } from '@/modules/equipment/equipment/dto/equipment-response.dto';
import { Public } from '@/core/decorators/public.decorator';
import { ResponseUtil } from '@/shared/utils/response.util';
import { B2C_OPTS } from '../b2c.constants';

@ApiTags('B2C 设备档案浏览')
@Controller('b2c/equipment')
export class B2CEquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'B2C 浏览设备档案列表',
    description: '公开接口，无需认证；强制 status=enabled + 加权排序',
  })
  @ApiResponse({ status: 200, description: '获取设备档案列表成功' })
  async findAll(@Query() query: QueryEquipmentDto) {
    const pageData = await this.equipmentService.findAll(query, B2C_OPTS);
    return ResponseUtil.paginated(pageData, '获取设备档案列表成功');
  }

  @Get(':id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'B2C 浏览设备档案详情',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({
    status: 200,
    description: '获取设备档案详情成功',
    type: EquipmentResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.equipmentService.findOne(id, B2C_OPTS);
    return ResponseUtil.found(data, '获取设备档案详情成功');
  }
}