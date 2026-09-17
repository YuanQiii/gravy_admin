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
import { PrismaService, BaseService, SoftDeleteService, PaginationData, startOfDay, endOfDay, INQUIRY_STATUS, InquiryStatus, isValidStatusTransition, buildStatusPatch, INQUIRY_NO_SEQ_LENGTH } from '@gvray/core';
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
import { InquiryPricingService } from '../pricing/inquiry-pricing.service';
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
    private readonly pricing: InquiryPricingService,
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

  /**
   * 推导下一个询价单编号候选（**单次推导**，含 advisory lock）。
   *
   * 收拢此前在 `create` / `createForCustomer` 各写一份的三段逻辑：
   * ① 数值比较取当月最大序号（`split('-')[1]` 转数值）——字典序在序号位数
   *   变化时会把 `-9999` 误判为大于 `-10000`，派生出必然已存在的候选号；
   * ② 等宽零填充（`INQUIRY_NO_SEQ_LENGTH = 6`），使字典序恒等于数值序；
   * ③ `pg_advisory_xact_lock(hashtext(candidate))` 串行化同候选号的并发推导。
   *
   * P2002 重试**不**在这里：重试必须与业务写入同循环（候选号失败后要连着
   * 重新推导再写入），放在本函数就得传回调，控制流反而更绕。两个调用方
   * 各保留一个 3 行的循环，推导逻辑本身已单点。
   */
  private async nextInquiryNo(
    tx: Prisma.TransactionClient,
    prefix: string,
  ): Promise<string> {
    const last = await tx.inquiry.findFirst({
      where: { inquiryNo: { startsWith: prefix } },
      orderBy: { inquiryNo: 'desc' },
    });
    const lastSeq = last
      ? parseInt(last.inquiryNo.split('-')[1] ?? '', 10) || 0
      : 0;
    const candidate = `${prefix}${String(lastSeq + 1).padStart(
      INQUIRY_NO_SEQ_LENGTH,
      '0',
    )}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate}))`;
    return candidate;
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
        const candidate = await this.nextInquiryNo(tx, prefix);
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
        const candidate = await this.nextInquiryNo(tx, prefix);
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

          // 明细行在客户路径里也是"明细写"：合计必须随之重算（P3-6）。
          // 客户填的行无价格 → 派生结果为 null，与"未报价"口径一致。
          await this.pricing.recomputeForInquiry(tx, inquiry.inquiryId);

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

  /**
   * 状态流转的**执行接缝**（`atomic-inquiry-status-transition`）。
   *
   * 把「期望的当前状态」作为写入的前置条件，使校验与写入成为**单一操作**：
   * 并发下的失效更新影响 0 行，因此不会写入任何字段 —— `status` 与时间戳
   * 互斥这一不变量由写入语句本身保证，而不是靠"调用方不并发"。
   *
   * - `expectedStatus` 进 `WHERE` 是原子性的**全部依据**；`count !== 1` 即前置条件
   *   失效，**不得**退回「按 `inquiryId` 无条件 `update`」。
   * - 失败归因由本接缝负责（`scope`）：行不存在/已软删/不在 scope 内 → 404；
   *   其余（状态已被并发改变）→ 409。归因与原子性保证是同一件事的两半，
   *   拆到两个调用方就无法在这里测。
   * - 字段映射交给 `buildStatusPatch`（@gvray/core），本接缝不自己拼 `data`。
   *
   * @param client 事务客户端或 PrismaService —— 事务边界由调用方决定
   * @param scope  仅用于失败归因：客户路径传 `{ customerId }`（他人单据视为不存在）
   */
  private async applyStatusTransition(
    client: Prisma.TransactionClient | PrismaService,
    args: {
      inquiryId: string;
      expectedStatus: string;
      newStatus: InquiryStatus;
      now: Date;
      expiresAt?: string | Date | null;
      updatedById?: string | null;
      scope?: { customerId: string };
    },
  ): Promise<InquiryResponseDto> {
    const { inquiryId, expectedStatus, newStatus, now, scope } = args;

    const { count } = await client.inquiry.updateMany({
      where: { inquiryId, status: expectedStatus, deletedAt: null },
      data: buildStatusPatch(newStatus, {
        now,
        expiresAt: args.expiresAt,
        updatedById: args.updatedById,
      }),
    });

    if (count !== 1) {
      // 归因：重读一次即可区分「不可见」与「已被并发改变」。
      const current = await client.inquiry.findFirst({
        where: scope ? { inquiryId, ...scope } : { inquiryId },
      });
      if (!current || current.deletedAt) {
        throw new NotFoundException('INQUIRY_NOT_FOUND');
      }
      throw new ConflictException('INQUIRY_INVALID_STATUS_TRANSITION');
    }

    const updated = await client.inquiry.findUnique({ where: { inquiryId } });
    if (!updated) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    return this.projectInquiry(updated);
  }

  /** 客户侧状态流转：先按 `inquiryId + customerId` 做所有权校验，再校验合法流转。 */
  private async transitionForCustomer(
    customerId: string,
    inquiryId: string,
    newStatus: InquiryStatus,
  ): Promise<InquiryResponseDto> {
    // 前置读取保留：所有权语义（他人单据 → 404，不泄露存在性）
    const existing = await this.prisma.inquiry.findFirst({
      where: { inquiryId, customerId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    // 快速失败：非法的目标状态在写入前就被拒（不必降级成"写入失败"）
    if (!isValidStatusTransition(existing.status, newStatus)) {
      throw new ConflictException('INQUIRY_INVALID_STATUS_TRANSITION');
    }

    // 执行交给接缝：以刚读到的状态为前置条件 —— 并发失效更新不会写入任何字段
    return this.applyStatusTransition(this.prisma, {
      inquiryId,
      expectedStatus: existing.status,
      newStatus,
      now: new Date(),
      scope: { customerId },
    });
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

  /**
   * 管理端更新（PATCH）。
   *
   * **换址 / 改价 = 新建一张询价单**（W1，design 决策 10）：`UpdateInquiryDto`
   * 已不含 `shippingAddressId` 与 `totalAmount`，因此本方法**不可能**改写
   * 地址引用、地址快照或合计 —— 单据的履约依据在创建时即冻结。
   */
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

    // 执行交给接缝。管理端按权限码可见，失败归因无需 scope（一律 409）。
    const result = await this.applyStatusTransition(this.prisma, {
      inquiryId,
      expectedStatus: existing.status,
      newStatus: newStatus as InquiryStatus,
      now: new Date(),
      expiresAt: dto?.expiresAt,
      updatedById: updatedById ?? null,
    });

    // 报价动作的第二个副作用：合计落定（P3-6）。正常情况下明细行写入时已
    // 保持 totalAmount 同步，此处重算是防御性的（例如明细行由旧版本写入）。
    if (newStatus === INQUIRY_STATUS.QUOTED) {
      await this.pricing.recomputeForInquiry(this.prisma, inquiryId);
    }
    return result;
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
