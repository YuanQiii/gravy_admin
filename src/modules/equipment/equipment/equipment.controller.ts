import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
import { EquipmentService } from './equipment.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { QueryEquipmentDto } from './dto/query-equipment.dto';
import { EquipmentResponseDto } from './dto/equipment-response.dto';
import { BatchDeleteEquipmentDto } from './dto/batch-delete-equipment.dto';
import { AttachFiltersDto } from './dto/attach-filters.dto';
import { RequirePermissions, OperationLog, CurrentUser, ResponseUtil, EQUIPMENT_PERMISSIONS, AccessGuard } from '@gvray/core';







@ApiTags('设备档案管理')
@ApiBearerAuth('JWT-auth')
@Controller('equipment/equipment')
@UseGuards(AccessGuard)
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Post()
  @RequirePermissions(EQUIPMENT_PERMISSIONS.CREATE)
  @OperationLog({ module: '设备档案管理' })
  @ApiOperation({ summary: '创建设备档案' })
  @ApiResponse({
    status: 201,
    description: '设备档案创建成功',
    type: EquipmentResponseDto,
  })
  async create(
    @Body() dto: CreateEquipmentDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.equipmentService.create(dto, user?.userId);
    return ResponseUtil.created(data, '设备档案创建成功');
  }

  @Get()
  @RequirePermissions(EQUIPMENT_PERMISSIONS.VIEW)
  @OperationLog({ module: '设备档案管理', action: 'view' })
  @ApiOperation({ summary: '获取设备档案列表' })
  @ApiResponse({ status: 200, description: '获取设备档案列表成功' })
  async findAll(@Query() query: QueryEquipmentDto) {
    const pageData = await this.equipmentService.findAll(query);
    return ResponseUtil.paginated(pageData, '获取设备档案列表成功');
  }

  @Get(':id')
  @RequirePermissions(EQUIPMENT_PERMISSIONS.VIEW)
  @OperationLog({ module: '设备档案管理', action: 'view' })
  @ApiOperation({ summary: '获取设备档案详情' })
  @ApiResponse({
    status: 200,
    description: '获取设备档案详情成功',
    type: EquipmentResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.equipmentService.findOne(id);
    return ResponseUtil.found(data, '获取设备档案详情成功');
  }

  @Patch(':id')
  @RequirePermissions(EQUIPMENT_PERMISSIONS.UPDATE)
  @OperationLog({ module: '设备档案管理', action: 'update' })
  @ApiOperation({ summary: '更新设备档案' })
  @ApiResponse({
    status: 200,
    description: '设备档案更新成功',
    type: EquipmentResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEquipmentDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.equipmentService.update(id, dto, user?.userId);
    return ResponseUtil.updated(data, '设备档案更新成功');
  }

  @Delete(':id')
  @RequirePermissions(EQUIPMENT_PERMISSIONS.DELETE)
  @OperationLog({ module: '设备档案管理', action: 'delete' })
  @ApiOperation({ summary: '删除设备档案（软删除）' })
  @ApiResponse({ status: 200, description: '设备档案删除成功' })
  async remove(@Param('id') id: string) {
    await this.equipmentService.remove(id);
    return ResponseUtil.deleted(null, '设备档案删除成功');
  }

  @Post('batch-delete')
  @RequirePermissions(EQUIPMENT_PERMISSIONS.DELETE)
  @OperationLog({ module: '设备档案管理', action: 'delete' })
  @ApiOperation({ summary: '批量删除设备档案' })
  @ApiBody({ type: BatchDeleteEquipmentDto })
  @ApiResponse({ status: 200, description: '批量删除成功' })
  async batchDelete(@Body() dto: BatchDeleteEquipmentDto) {
    await this.equipmentService.removeMany(dto.ids);
    return ResponseUtil.deleted(null, '设备档案批量删除成功');
  }

  @Post(':id/filters')
  @RequirePermissions(EQUIPMENT_PERMISSIONS.UPDATE)
  @OperationLog({ module: '设备档案管理', action: 'update' })
  @ApiOperation({ summary: '设备挂载滤清器' })
  @ApiBody({ type: AttachFiltersDto })
  @ApiResponse({ status: 200, description: '滤清器挂载成功' })
  async attachFilters(@Param('id') id: string, @Body() dto: AttachFiltersDto) {
    const result = await this.equipmentService.attachFilters(id, dto.filterIds);
    return ResponseUtil.updated(result, '滤清器挂载成功');
  }

  @Delete(':id/filters/:filterId')
  @RequirePermissions(EQUIPMENT_PERMISSIONS.UPDATE)
  @OperationLog({ module: '设备档案管理', action: 'update' })
  @ApiOperation({ summary: '设备卸载滤清器' })
  @ApiResponse({ status: 200, description: '滤清器卸载成功' })
  async detachFilter(
    @Param('id') id: string,
    @Param('filterId') filterId: string,
  ) {
    await this.equipmentService.detachFilter(id, filterId);
    return ResponseUtil.deleted(null, '滤清器卸载成功');
  }

  @Get(':id/filters')
  @RequirePermissions(EQUIPMENT_PERMISSIONS.VIEW)
  @ApiOperation({ summary: '获取设备关联的滤清器列表' })
  @ApiResponse({ status: 200, description: '获取设备滤清器列表成功' })
  async listFilters(@Param('id') id: string) {
    const filters = await this.equipmentService.listFilters(id);
    return ResponseUtil.found(filters, '获取设备滤清器列表成功');
  }
}
