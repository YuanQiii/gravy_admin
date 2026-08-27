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
import { InquiriesService } from './inquiries.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import { UpdateInquiryStatusDto } from './dto/update-inquiry-status.dto';
import { QueryInquiryDto } from './dto/query-inquiry.dto';
import { InquiryResponseDto } from './dto/inquiry-response.dto';
import { BatchDeleteInquiriesDto } from './dto/batch-delete-inquiries.dto';
import { RequirePermissions } from '@/core/decorators/permissions.decorator';
import { OperationLog } from '@/core/decorators/operation-log.decorator';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ResponseUtil } from '@/shared/utils/response.util';
import { INQUIRY_PERMISSIONS } from '@/shared/constants/permissions.constant';
import { AccessGuard } from '@/core/guards/access.guard';

@ApiTags('询价单管理')
@ApiBearerAuth('JWT-auth')
@Controller('inquiry/inquiries')
@UseGuards(AccessGuard)
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Post()
  @RequirePermissions(INQUIRY_PERMISSIONS.CREATE)
  @OperationLog({ module: '询价单管理' })
  @ApiOperation({ summary: '创建询价单' })
  @ApiResponse({
    status: 201,
    description: '询价单创建成功',
    type: InquiryResponseDto,
  })
  async create(
    @Body() dto: CreateInquiryDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.inquiriesService.create(dto, user?.userId);
    return ResponseUtil.created(data, '询价单创建成功');
  }

  @Get()
  @RequirePermissions(INQUIRY_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取询价单列表' })
  @ApiResponse({ status: 200, description: '获取询价单列表成功' })
  async findAll(@Query() query: QueryInquiryDto) {
    const pageData = await this.inquiriesService.findAll(query);
    return ResponseUtil.paginated(pageData, '获取询价单列表成功');
  }

  @Get(':id')
  @RequirePermissions(INQUIRY_PERMISSIONS.VIEW)
  @ApiOperation({ summary: '获取询价单详情' })
  @ApiResponse({
    status: 200,
    description: '获取询价单详情成功',
    type: InquiryResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.inquiriesService.findOne(id);
    return ResponseUtil.found(data, '获取询价单详情成功');
  }

  @Patch(':id')
  @RequirePermissions(INQUIRY_PERMISSIONS.UPDATE)
  @OperationLog({ module: '询价单管理', action: 'update' })
  @ApiOperation({ summary: '更新询价单' })
  @ApiResponse({
    status: 200,
    description: '询价单更新成功',
    type: InquiryResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInquiryDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.inquiriesService.update(id, dto, user?.userId);
    return ResponseUtil.updated(data, '询价单更新成功');
  }

  @Patch(':id/status')
  @RequirePermissions(INQUIRY_PERMISSIONS.UPDATE)
  @OperationLog({ module: '询价单管理', action: 'update' })
  @ApiOperation({ summary: '更新询价单状态' })
  @ApiResponse({
    status: 200,
    description: '询价单状态更新成功',
    type: InquiryResponseDto,
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateInquiryStatusDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.inquiriesService.updateStatus(
      id,
      dto.status,
      dto,
      user?.userId,
    );
    return ResponseUtil.updated(data, '询价单状态更新成功');
  }

  @Delete(':id')
  @RequirePermissions(INQUIRY_PERMISSIONS.DELETE)
  @OperationLog({ module: '询价单管理', action: 'delete' })
  @ApiOperation({ summary: '删除询价单（软删除）' })
  @ApiResponse({ status: 200, description: '询价单删除成功' })
  async remove(@Param('id') id: string) {
    await this.inquiriesService.remove(id);
    return ResponseUtil.deleted(null, '询价单删除成功');
  }

  @Post('batch-delete')
  @RequirePermissions(INQUIRY_PERMISSIONS.DELETE)
  @OperationLog({ module: '询价单管理', action: 'delete' })
  @ApiOperation({ summary: '批量删除询价单' })
  @ApiBody({ type: BatchDeleteInquiriesDto })
  @ApiResponse({ status: 200, description: '批量删除成功' })
  async batchDelete(@Body() dto: BatchDeleteInquiriesDto) {
    await this.inquiriesService.removeMany(dto.ids);
    return ResponseUtil.deleted(null, '询价单批量删除成功');
  }
}
