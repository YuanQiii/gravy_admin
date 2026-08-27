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
import { FilterTypesService } from './filter-types.service';
import { CreateFilterTypeDto } from './dto/create-filter-type.dto';
import { UpdateFilterTypeDto } from './dto/update-filter-type.dto';
import { QueryFilterTypeDto } from './dto/query-filter-type.dto';
import { FilterTypeResponseDto } from './dto/filter-type-response.dto';
import { BatchDeleteFilterTypesDto } from './dto/batch-delete-filter-types.dto';
import { RequirePermissions } from '@/core/decorators/permissions.decorator';
import { OperationLog } from '@/core/decorators/operation-log.decorator';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ResponseUtil } from '@/shared/utils/response.util';
import { EQUIPMENT_FILTER_TYPE_PERMISSIONS } from '@/shared/constants/permissions.constant';
import { AccessGuard } from '@/core/guards/access.guard';
import { Public } from '@/core/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('滤清器类型管理')
@ApiBearerAuth('JWT-auth')
@Controller('equipment/filter-types')
@UseGuards(AccessGuard)
export class FilterTypesController {
  constructor(private readonly filterTypesService: FilterTypesService) {}

  @Post()
  @RequirePermissions(EQUIPMENT_FILTER_TYPE_PERMISSIONS.CREATE)
  @OperationLog({ module: '滤清器类型管理' })
  @ApiOperation({ summary: '创建滤清器类型' })
  @ApiResponse({
    status: 201,
    description: '滤清器类型创建成功',
    type: FilterTypeResponseDto,
  })
  async create(
    @Body() dto: CreateFilterTypeDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.filterTypesService.create(dto, user?.userId);
    return ResponseUtil.created(data, '滤清器类型创建成功');
  }

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '获取滤清器类型列表',
    description: '公开接口，无需认证',
  })
  @ApiResponse({ status: 200, description: '获取滤清器类型列表成功' })
  async findAll(
    @Query() query: QueryFilterTypeDto,
    @CurrentUser() user?: { userId?: string },
  ) {
    const pageData = await this.filterTypesService.findAll(
      query,
      user ? undefined : { visibility: 'anonymous' },
    );
    return ResponseUtil.paginated(pageData, '获取滤清器类型列表成功');
  }

  @Get('options')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '获取启用的滤清器类型下拉选项',
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
    summary: '获取滤清器类型详情',
    description: '公开接口，无需认证',
  })
  @ApiResponse({
    status: 200,
    description: '获取滤清器类型详情成功',
    type: FilterTypeResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user?: { userId?: string },
  ) {
    const data = await this.filterTypesService.findOne(
      id,
      user ? undefined : { visibility: 'anonymous' },
    );
    return ResponseUtil.found(data, '获取滤清器类型详情成功');
  }

  @Patch(':id')
  @RequirePermissions(EQUIPMENT_FILTER_TYPE_PERMISSIONS.UPDATE)
  @OperationLog({ module: '滤清器类型管理', action: 'update' })
  @ApiOperation({ summary: '更新滤清器类型' })
  @ApiResponse({
    status: 200,
    description: '滤清器类型更新成功',
    type: FilterTypeResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFilterTypeDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.filterTypesService.update(id, dto, user?.userId);
    return ResponseUtil.updated(data, '滤清器类型更新成功');
  }

  @Delete(':id')
  @RequirePermissions(EQUIPMENT_FILTER_TYPE_PERMISSIONS.DELETE)
  @OperationLog({ module: '滤清器类型管理', action: 'delete' })
  @ApiOperation({ summary: '删除滤清器类型（软删除）' })
  @ApiResponse({ status: 200, description: '滤清器类型删除成功' })
  async remove(@Param('id') id: string) {
    await this.filterTypesService.remove(id);
    return ResponseUtil.deleted(null, '滤清器类型删除成功');
  }

  @Post('batch-delete')
  @RequirePermissions(EQUIPMENT_FILTER_TYPE_PERMISSIONS.DELETE)
  @OperationLog({ module: '滤清器类型管理', action: 'delete' })
  @ApiOperation({ summary: '批量删除滤清器类型' })
  @ApiBody({ type: BatchDeleteFilterTypesDto })
  @ApiResponse({ status: 200, description: '批量删除成功' })
  async batchDelete(@Body() dto: BatchDeleteFilterTypesDto) {
    await this.filterTypesService.removeMany(dto.ids);
    return ResponseUtil.deleted(null, '滤清器类型批量删除成功');
  }
}
