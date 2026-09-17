import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService, BaseService, SoftDeleteService, PaginationData, startOfDay, endOfDay, INQUIRY_STATUS, InquiryStatus, isValidStatusTransition } from '@gvray/core';
import { ACTIVE_FILTER_WHERE } from '../../equipment/filters/active-filter';






import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import { UpdateInquiryStatusDto } from './dto/update-inquiry-status.dto';
import { QueryInquiryDto } from './dto/query-inquiry.dto';
import { InquiryResponseDto } from './dto/inquiry-response.dto';
import { InquiryDetailResponseDto } from './dto/inquiry-detail-response.dto';
import type { ShippingSnapshotShape } from './dto/shipping-snapshot.shape';
import {
  assertShippingAddressOwned,
  resolveOwnerCustomerId,
} from './shipping-address-ownership';
// 类型仅在编译期引用（creates no runtime module edge），避免 b2c → inquiry → b2c 环
import type { CreateCustomerInquiryDto } from './dto/customer-b2c/create-customer-inquiry.dto';
import type { CreateInquiryLineItemDto } from './dto/customer-b2c/create-inquiry-line-item.dto';

/**
 * 详情读取形状 —— `Inquiry response projection` 接缝的「怎么读」一半
 * （见 CONTEXT.md 词条）。
 *
 * 明细行只取未软删除的，排序交给数据库（`sortOrder` 升序、同值 `createdAt`
 * 升序）而非依赖 `include` 的返回顺序。两个详情方法共用本常量，形状不再各写一份。
 */
const INQUIRY_DETAIL_INCLUDE = {
  inquiryLines: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.InquiryInclude;

/**
 * 快照读取形状 —— 读到的字段与写出的快照字段同源（`ShippingSnapshotShape`）。
 *
 * 除 7 个快照字段外，刻意一并取出 `customerId`（归属断言）与 `deletedAt`（可用性断言）：
 * 守卫所需的判断依据与快照在同一次读取内取得，避免"读完再查一次"的窗口。
 */
const SHIPPING_SNAPSHOT_SELECT = {
  customerId: true,
  deletedAt: true,
  receiver: true,
  phone: true,
  province: true,
  city: true,
  district: true,
  detailAddress: true,
  zipCode: true,
} satisfies Prisma.CustomerAddressSelect;

/** 投影入参：Prisma 行（含或不含 `inquiryLines` 关联），纯结构类型。 */
type InquiryProjectionRow = Record<string, unknown>;

@Injectable()
export class InquiriesService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  // ==================== 响应投影接缝（Inquiry response projection）====================

  /**
   * 列表与写路径的响应形状：`InquiryResponseDto`（不含 `inquiryLines`）。
   *
   * 本接缝是全部出口**唯一**的映射点：出口 DTO 的选择与字段过滤口径都收在这里，
   * 调用方只表达「投影这一行」。给 DTO 增删字段不需要碰任何出口。
   */
  private projectInquiry(row: InquiryProjectionRow): InquiryResponseDto {
    return plainToInstance(InquiryResponseDto, row, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * 详情路径的响应形状：`InquiryDetailResponseDto`（含 `inquiryLines`）。
   *
   * 必须与 `INQUIRY_DETAIL_INCLUDE` 配对使用 —— 不带该 include 时
   * `inquiryLines` 会是 `undefined`。
   */
  private projectInquiryDetail(
    row: InquiryProjectionRow,
  ): InquiryDetailResponseDto {
    return plainToInstance(InquiryDetailResponseDto, row, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * 读取被引用地址 → 断言可用性与归属 → 产出收货地址快照。
   *
   * 判定部分（存在 + 未软删 + 归属）由 `assertShippingAddressOwned` 单一表达，
   * 客户自助路径与管理端路径共用同一实现 —— 同一不变量不再表达两次。
   *
   * **必须在事务内调用**：读取与后续写入落在同一事务，消除「校验通过 → 地址被删 →
   * 外键 SetNull 静默吞掉」的窗口。
   *
   * @param ownerCustomerId 由 `resolveOwnerCustomerId` 解析：管理端取 `dto.customerId`
   *   （可为 `null`，表示不校验归属 —— 匿名询价与后台未指定客户的既有行为）；
   *   客户自助路径取登录态（必非空）。
   */
  private async resolveShippingSnapshot(
    tx: Prisma.TransactionClient,
    addressId: string,
    ownerCustomerId?: string | null,
  ): Promise<ShippingSnapshotShape> {
    const address = await tx.customerAddress.findUnique({
      where: { addressId },
      select: SHIPPING_SNAPSHOT_SELECT,
    });
    assertShippingAddressOwned(address, ownerCustomerId);
    return {
      shippingReceiver: address.receiver,
      shippingPhone: address.phone,
      shippingProvince: address.province,
      shippingCity: address.city,
      shippingDistrict: address.district,
      shippingDetailAddress: address.detailAddress,
      shippingZipCode: address.zipCode,
    };
  }

  async create(
    dto: CreateInquiryDto,
    createdById?: string,
  ): Promise<InquiryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const prefix = `INQ${yyyy}${mm}-`;
      const { expiresAt, shippingAddressId, ...rest } = dto;

      // 收货地址快照：与主体同一事务内解析。地址不存在/已软删/不属于该客户 → 400
      // （此前会落到 Prisma 外键错误 → 500，或把他人地址挂到本单上）。
      const shippingSnapshot = shippingAddressId
        ? await this.resolveShippingSnapshot(
            tx,
            shippingAddressId,
            resolveOwnerCustomerId({
              realm: 'admin',
              customerId: dto.customerId,
            }),
          )
        : null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const last = await tx.inquiry.findFirst({
          where: { inquiryNo: { startsWith: prefix } },
          orderBy: { inquiryNo: 'desc' },
        });
        const next = (last ? parseInt(last.inquiryNo.slice(-4), 10) : 0) + 1;
        const candidate = `${prefix}${String(next).padStart(4, '0')}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate}))`;
        try {
          const inquiry = await tx.inquiry.create({
            data: {
              ...rest,
              ...(shippingSnapshot ?? {}),
              shippingAddressId: shippingAddressId ?? null,
              inquiryNo: candidate,
              status: INQUIRY_STATUS.DRAFT,
              createdById: createdById ?? null,
              ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
            },
          });
          return this.projectInquiry(inquiry);
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            attempt < 2
          ) {
            continue;
          }
          throw error;
        }
      }
      throw new InternalServerErrorException('INQUIRY_NO_GENERATION_FAILED');
    });
  }

  /**
   * B2C 客户自助创建询价单（所有权下沉到接口）。
   *
   * `customerId` 为首参（来自 `@CurrentCustomer()`），忽略任何 DTO 中的
   * customer 身份字段（DTO 本就不含）；`createdById = null`（B2C 无后台操作员）；
   * 主体 + 明细行在**同一事务**内原子创建（一笔询价是原子业务单元，拆两次调用
   * 会留下孤儿询价）。客户名/邮箱/电话快照自 Customer 记录填充，明细行
   * productName/model/typeName 自 Filter 快照填充；`shippingAddressId` 校验属于
   * 当前客户。
   */
  async createForCustomer(
    customerId: string,
    dto: CreateCustomerInquiryDto,
    lines: CreateInquiryLineItemDto[],
  ): Promise<InquiryResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { customerId },
      // 白名单投影，避免把 password 哈希带进内存（仅定位/快照所需字段）
      select: {
        customerId: true,
        deletedAt: true,
        nickName: true,
        email: true,
        phoneNumber: true,
      },
    });
    if (!customer || customer.deletedAt) {
      throw new NotFoundException('CUSTOMER_NOT_FOUND');
    }

    return this.prisma.$transaction(async (tx) => {
      // 收货地址快照：归属断言与读取同在 `resolveShippingSnapshot` 内、同在事务内。
      // 原先事务外的归属校验已**净删除** —— 同一不变量不再表达两次（状态码与消息不变）。
      const shippingSnapshot = dto.shippingAddressId
        ? await this.resolveShippingSnapshot(
            tx,
            dto.shippingAddressId,
            resolveOwnerCustomerId({ realm: 'customer', customerId }),
          )
        : null;
      // 批量解析明细行快照：一次性按 ACTIVE_FILTER_WHERE（单门禁源）批量查滤清器，
      // 替代逐行 findUnique 的 N+1，且「当前可用性」判定与收藏/浏览保持一致。
      const filterIds = Array.from(
        new Set(lines.filter((l) => l.filterId).map((l) => l.filterId as string)),
      );
      const activeFilters = filterIds.length
        ? await tx.filter.findMany({
            where: { filterId: { in: filterIds }, ...ACTIVE_FILTER_WHERE },
          })
        : [];
      const activeFilterIds = new Set(activeFilters.map((f) => f.filterId));
      const resolvedLines = lines.map((line) => {
        if (line.filterId) {
          if (!activeFilterIds.has(line.filterId)) {
            throw new BadRequestException('FILTER_NOT_AVAILABLE');
          }
          const filter = activeFilters.find((f) => f.filterId === line.filterId)!;
          return {
            productName: filter.model,
            model: filter.model as string | null,
            typeName: (filter.typeName as string | null) ?? null,
          };
        }
        if (line.productName) {
          return { productName: line.productName, model: null, typeName: null };
        }
        throw new BadRequestException('INQUIRY_LINE_PRODUCT_NAME_REQUIRED');
      });

      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const prefix = `INQ${yyyy}${mm}-`;

      for (let attempt = 0; attempt < 3; attempt++) {
        const last = await tx.inquiry.findFirst({
          where: { inquiryNo: { startsWith: prefix } },
          orderBy: { inquiryNo: 'desc' },
        });
        const next = (last ? parseInt(last.inquiryNo.slice(-4), 10) : 0) + 1;
        const candidate = `${prefix}${String(next).padStart(4, '0')}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate}))`;
        try {
          const inquiry = await tx.inquiry.create({
            data: {
              title: dto.title,
              description: dto.description ?? null,
              inquiryNo: candidate,
              status: INQUIRY_STATUS.DRAFT,
              customerId,
              createdById: null,
              customerName: customer.nickName ?? null,
              customerEmail: customer.email ?? null,
              customerPhone: customer.phoneNumber ?? null,
              ...(shippingSnapshot ?? {}),
              shippingAddressId: dto.shippingAddressId ?? null,
            },
          });

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const resolved = resolvedLines[i];
            await tx.inquiryLine.create({
              data: {
                inquiryId: inquiry.inquiryId,
                filterId: line.filterId ?? null,
                productName: resolved.productName,
                model: resolved.model,
                typeName: resolved.typeName,
                quantity: line.quantity ?? 1,
                remarks: line.remarks ?? null,
                sortOrder: line.sortOrder ?? 0,
                createdById: null,
              },
            });
          }

          return this.projectInquiry(inquiry);
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            attempt < 2
          ) {
            continue;
          }
          throw error;
        }
      }
      throw new InternalServerErrorException('INQUIRY_NO_GENERATION_FAILED');
    });
  }

  /**
   * 客户查询本人询价单列表（`createdAt` 降序分页，仅当前客户）。
   */
  async findMyInquiries(
    customerId: string,
    query: QueryInquiryDto,
  ): Promise<PaginationData<InquiryResponseDto>> {
    await this.expireDueQuoted();
    const where: Record<string, unknown> = { deletedAt: null, customerId };
    const result = await this.paginateWithSort(
      this.prisma.inquiry,
      query,
      where,
      undefined,
      'createdAt',
    );
    return {
      ...result,
      items: result.items.map((row) => this.projectInquiry(row)),
    };
  }

  /**
   * 客户查询本人询价单详情（含明细行与报价字段）。他人询价单返回 404，
   * 不泄露任何询价信息。
   */
  async findOneForCustomer(
    customerId: string,
    inquiryId: string,
  ): Promise<InquiryDetailResponseDto> {
    await this.expireDueQuoted();
    const inquiry = await this.prisma.inquiry.findFirst({
      where: { inquiryId, customerId },
      include: INQUIRY_DETAIL_INCLUDE,
    });
    if (!inquiry || inquiry.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    return this.projectInquiryDetail(inquiry);
  }

  /**
   * 客户提交本人的 draft 询价单（draft→submitted，置 `submittedAt`）。
   * 所有权校验失败一律返回 404，不泄露他人询价存在性。
   */
  async submitForCustomer(
    customerId: string,
    inquiryId: string,
  ): Promise<InquiryResponseDto> {
    return this.transitionForCustomer(
      customerId,
      inquiryId,
      INQUIRY_STATUS.SUBMITTED,
    );
  }

  /**
   * 客户取消本人的 draft/submitted 询价单（→cancelled，置 `cancelledAt`，终态）。
   * `quoted`/`expired` 不可取消；所有权校验失败返回 404。
   */
  async cancelForCustomer(
    customerId: string,
    inquiryId: string,
  ): Promise<InquiryResponseDto> {
    return this.transitionForCustomer(
      customerId,
      inquiryId,
      INQUIRY_STATUS.CANCELLED,
    );
  }

  /**
   * 懒过期：把已到 `expiresAt` 的 quoted 询价单批量流转为 expired（终态）。
   * 查询路径在返回状态前调用，保证对外永不呈现"报价已过期却仍显示 quoted"的
   * 半闭环状态。只命中 `quoted + expiresAt <= now + 未软删`，天然是合法流转
   * （quoted→expired），expired 为终态不会再被误转。无调度基础设施，故用
   * 读时补流转（updateMany 单条 SQL，成本可控）。
   */
  private async expireDueQuoted(): Promise<void> {
    await this.prisma.inquiry.updateMany({
      where: {
        status: INQUIRY_STATUS.QUOTED,
        expiresAt: { lte: new Date() },
        deletedAt: null,
      },
      data: { status: INQUIRY_STATUS.EXPIRED },
    });
  }

  /** 客户侧状态流转：先按 `inquiryId + customerId` 做所有权校验，再校验合法流转。 */
  private async transitionForCustomer(
    customerId: string,
    inquiryId: string,
    newStatus: InquiryStatus,
  ): Promise<InquiryResponseDto> {
    const existing = await this.prisma.inquiry.findFirst({
      where: { inquiryId, customerId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    if (!isValidStatusTransition(existing.status, newStatus)) {
      throw new ConflictException('INQUIRY_INVALID_STATUS_TRANSITION');
    }

    const now = new Date();
    const inquiry = await this.prisma.inquiry.update({
      where: { inquiryId },
      data: {
        status: newStatus,
        ...(newStatus === INQUIRY_STATUS.SUBMITTED ? { submittedAt: now } : {}),
        ...(newStatus === INQUIRY_STATUS.CANCELLED
          ? { cancelledAt: now }
          : {}),
      },
    });
    return this.projectInquiry(inquiry);
  }

  async findAll(
    query: QueryInquiryDto,
  ): Promise<PaginationData<InquiryResponseDto>> {
    await this.expireDueQuoted();
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.keyword) {
      where.OR = [
        { inquiryNo: { contains: query.keyword, mode: 'insensitive' } },
        { customerName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.createdById) {
      where.createdById = query.createdById;
    }
    if (query.createdAtStart || query.createdAtEnd) {
      const tzSuffix = this.configService.get<string>('app.tzSuffix', '+08:00');
      const o: { gte?: Date; lte?: Date } = {};
      if (query.createdAtStart) {
        o.gte = startOfDay(query.createdAtStart, tzSuffix);
      }
      if (query.createdAtEnd) {
        o.lte = endOfDay(query.createdAtEnd, tzSuffix);
      }
      where.createdAt = o;
    }

    const result = await this.paginateWithSort(
      this.prisma.inquiry,
      query,
      where,
      undefined,
      'createdAt',
    );
    return {
      ...result,
      items: result.items.map((row) => this.projectInquiry(row)),
    };
  }

  async findOne(inquiryId: string): Promise<InquiryDetailResponseDto> {
    await this.expireDueQuoted();
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { inquiryId },
      include: INQUIRY_DETAIL_INCLUDE,
    });
    if (!inquiry || inquiry.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    return this.projectInquiryDetail(inquiry);
  }

  async update(
    inquiryId: string,
    dto: UpdateInquiryDto,
    updatedById?: string,
  ): Promise<InquiryResponseDto> {
    const existing = await this.prisma.inquiry.findUnique({
      where: { inquiryId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }

    const { expiresAt, ...rest } = dto;
    const inquiry = await this.prisma.inquiry.update({
      where: { inquiryId },
      data: {
        ...rest,
        updatedById: updatedById ?? null,
        ...(expiresAt !== undefined
          ? { expiresAt: expiresAt ? new Date(expiresAt) : null }
          : {}),
      },
    });
    return this.projectInquiry(inquiry);
  }

  async updateStatus(
    inquiryId: string,
    newStatus: string,
    dto?: UpdateInquiryStatusDto,
    updatedById?: string,
  ): Promise<InquiryResponseDto> {
    const existing = await this.prisma.inquiry.findUnique({
      where: { inquiryId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    if (!isValidStatusTransition(existing.status, newStatus)) {
      throw new ConflictException('INQUIRY_INVALID_STATUS_TRANSITION');
    }

    const now = new Date();
    const inquiry = await this.prisma.inquiry.update({
      where: { inquiryId },
      data: {
        status: newStatus,
        updatedById: updatedById ?? null,
        ...(newStatus === INQUIRY_STATUS.SUBMITTED ? { submittedAt: now } : {}),
        ...(newStatus === INQUIRY_STATUS.QUOTED
          ? {
              quotedAt: now,
              ...(dto?.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}),
            }
          : {}),
        ...(newStatus === INQUIRY_STATUS.CANCELLED ? { cancelledAt: now } : {}),
      },
    });
    return this.projectInquiry(inquiry);
  }

  async remove(inquiryId: string): Promise<void> {
    const existing = await this.prisma.inquiry.findUnique({
      where: { inquiryId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    await this.softDelete.softDelete(
      this.prisma.inquiry,
      'inquiryId',
      inquiryId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.inquiry.updateMany({
      where: { inquiryId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
