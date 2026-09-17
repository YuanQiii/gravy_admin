import { BadRequestException } from '@nestjs/common';

/**
 * 收货地址的**归属不变量**：「地址存在 + 属于指定客户」的唯一表达。
 *
 * CustomerAddress 为**有意硬删**（unify-soft-delete-mechanics，ADR 0016）：
 * 不存在软删态，"存在即可用" —— 此前版本的三元不变量里有 `deletedAt`
 * 一支，那是死条件（该列从未被写入），已随删列一并移除。
 *
 * 客户自助路径与管理端路径共用它，因此两条路径不可能对"什么算有效地址"给出不同结论
 * —— 同一规则表达两次正是本项目反复出现的缺陷形态。
 *
 * 与 `InquiriesService.resolveShippingSnapshot` 的分工：本函数**只判定**，不读库、
 * 不产出快照；读取与快照映射留在接缝内（那里才是拿到 `tx` 的地方）。
 *
 * 两种失败共用同一错误码与消息，因此不需要分支。
 *
 * 声明为**断言函数**（`asserts address is T`）而非返回布尔：调用方在调用之后即可
 * 安全使用 `address`，不需要再写一次空值判断。
 */
export function assertShippingAddressOwned<
  T extends { customerId: string },
>(address: T | null, ownerCustomerId?: string | null): asserts address is T {
  if (!address || (ownerCustomerId && address.customerId !== ownerCustomerId)) {
    throw new BadRequestException('INVALID_SHIPPING_ADDRESS');
  }
}

/**
 * 「谁拥有这张单据的收货地址」——两条创建路径的来源不同，差异只在这一处声明。
 *
 * - 管理端：`dto.customerId`，**可空**；为空时返回 `null`，语义是"不校验归属"
 *   （匿名询价与后台未指定客户时的既有行为）。
 * - 客户自助：来自登录态（`@CurrentCustomer()`），必非空。
 *
 * 之所以要有这个函数而不是两处各写一个实参：将来若新增第三种来源（例如导入、
 * 渠道单），需要回答的问题只有一个——"它的 owner 从哪来"。
 */
export function resolveOwnerCustomerId(
  source:
    | { realm: 'admin'; customerId?: string | null }
    | { realm: 'customer'; customerId: string },
): string | null {
  return source.realm === 'customer'
    ? source.customerId
    : (source.customerId ?? null);
}
