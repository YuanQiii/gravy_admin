import {
  Controller,
  Get,
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
} from '@nestjs/swagger';
import { CustomerActivityService } from './customer-activity.service';
import { QueryHistoryDto } from './dto/query-history.dto';
import { RequirePermissions } from '@/core/decorators/permissions.decorator';
import { OperationLog } from '@/core/decorators/operation-log.decorator';
import { ResponseUtil } from '@/shared/utils/response.util';
import { CUSTOMER_HISTORY_PERMISSIONS } from '@/shared/constants/permissions.constant';
import { AccessGuard } from '@/core/guards/access.guard';

/**
 * 客户浏览历史管理。
 *
 * NOTE: recordView is called internally by the filter detail-view flow, not
 * exposed as a public endpoint. CUSTOMER_HISTORY_PERMISSIONS has no CREATE/UPDATE
 * because history is auto-recorded via upsert semantics. The VIEW permission is
 * reserved for future internal/detail-flow use; this controller exposes only
 * LIST and DELETE per spec.
 */
@ApiTags('客户浏览历史管理')
@ApiBearerAuth('JWT-auth')
@Controller('customer/history')
@UseGuards(AccessGuard)
export class HistoryController {
  constructor(private readonly activityService: CustomerActivityService) {}

  @Get()
  @RequirePermissions(CUSTOMER_HISTORY_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取客户浏览历史列表' })
  @ApiResponse({ status: 200, description: '获取浏览历史成功' })
  async findAll(@Query() query: QueryHistoryDto) {
    const pageData = await this.activityService.findHistory(query);
    return ResponseUtil.paginated(pageData, '获取浏览历史成功');
  }

  @Delete(':id')
  @RequirePermissions(CUSTOMER_HISTORY_PERMISSIONS.DELETE)
  @OperationLog({ module: '客户浏览历史管理', action: 'delete' })
  @ApiOperation({ summary: '删除浏览历史（软删除）' })
  @ApiResponse({ status: 200, description: '浏览历史删除成功' })
  async remove(@Param('id') id: string) {
    await this.activityService.removeHistory(id);
    return ResponseUtil.deleted(null, '浏览历史删除成功');
  }
}
