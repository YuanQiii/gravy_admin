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
import { FiltersService } from './filters.service';
import { CreateFilterDto } from './dto/create-filter.dto';
import { UpdateFilterDto } from './dto/update-filter.dto';
import { QueryFilterDto } from './dto/query-filter.dto';
import { FilterResponseDto } from './dto/filter-response.dto';
import { BatchDeleteFiltersDto } from './dto/batch-delete-filters.dto';
import { RequirePermissions, OperationLog, CurrentUser, ResponseUtil, EQUIPMENT_FILTER_PERMISSIONS, AccessGuard } from '@gvray/core';







@ApiTags('滤清器管理')
@ApiBearerAuth('JWT-auth')
@Controller('equipment/filters')
@UseGuards(AccessGuard)
export class FiltersController {
  constructor(private readonly filtersService: FiltersService) {}

  @Post()
  @RequirePermissions(EQUIPMENT_FILTER_PERMISSIONS.CREATE)
  @OperationLog({ module: '滤清器管理' })
  @ApiOperation({ summary: '创建滤清器' })
  @ApiResponse({
    status: 201,
    description: '滤清器创建成功',
    type: FilterResponseDto,
  })
  async create(
    @Body() dto: CreateFilterDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.filtersService.create(dto, user?.userId);
    return ResponseUtil.created(data, '滤清器创建成功');
  }

  @Get()
  @RequirePermissions(EQUIPMENT_FILTER_PERMISSIONS.VIEW)
  @OperationLog({ module: '滤清器管理', action: 'view' })
  @ApiOperation({ summary: '获取滤清器列表' })
  @ApiResponse({ status: 200, description: '获取滤清器列表成功' })
  async findAll(@Query() query: QueryFilterDto) {
    const pageData = await this.filtersService.findAll(query);
    return ResponseUtil.paginated(pageData, '获取滤清器列表成功');
  }

  @Get(':id')
  @RequirePermissions(EQUIPMENT_FILTER_PERMISSIONS.VIEW)
  @OperationLog({ module: '滤清器管理', action: 'view' })
  @ApiOperation({ summary: '获取滤清器详情' })
  @ApiResponse({
    status: 200,
    description: '获取滤清器详情成功',
    type: FilterResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.filtersService.findOne(id);
    return ResponseUtil.found(data, '获取滤清器详情成功');
  }

  @Patch(':id')
  @RequirePermissions(EQUIPMENT_FILTER_PERMISSIONS.UPDATE)
  @OperationLog({ module: '滤清器管理', action: 'update' })
  @ApiOperation({ summary: '更新滤清器' })
  @ApiResponse({
    status: 200,
    description: '滤清器更新成功',
    type: FilterResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFilterDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.filtersService.update(id, dto, user?.userId);
    return ResponseUtil.updated(data, '滤清器更新成功');
  }

  @Delete(':id')
  @RequirePermissions(EQUIPMENT_FILTER_PERMISSIONS.DELETE)
  @OperationLog({ module: '滤清器管理', action: 'delete' })
  @ApiOperation({ summary: '删除滤清器（软删除）' })
  @ApiResponse({ status: 200, description: '滤清器删除成功' })
  async remove(@Param('id') id: string) {
    await this.filtersService.remove(id);
    return ResponseUtil.deleted(null, '滤清器删除成功');
  }

  @Post('batch-delete')
  @RequirePermissions(EQUIPMENT_FILTER_PERMISSIONS.DELETE)
  @OperationLog({ module: '滤清器管理', action: 'delete' })
  @ApiOperation({ summary: '批量删除滤清器' })
  @ApiBody({ type: BatchDeleteFiltersDto })
  @ApiResponse({ status: 200, description: '批量删除成功' })
  async batchDelete(@Body() dto: BatchDeleteFiltersDto) {
    await this.filtersService.removeMany(dto.ids);
    return ResponseUtil.deleted(null, '滤清器批量删除成功');
  }
}
