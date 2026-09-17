/**
 * 客户可用性政策（`unify-customer-availability-gate` T2b/T8）——
 * 「access token TTL 内是否校验客户可用性」这一问题的**单一来源**。
 *
 * 背景：客户 access token 无状态（ADR 0011 决策 3），TTL 内被禁用/软删的客户
 * 仍能通过守卫。历史上各写路径对该事实的应对不一致（inquiry 查了 `deletedAt`，
 * favorites/history/addresses 不查），同一语义得出不同结论。本变更统一为路线 ②：
 * **所有**受保护写路径在 TTL 内一致不校验，业务状态仅在 refresh 路径校验。
 *
 * 为什么用一个 module 而不是靠"大家都不查"的默契：不查是一个**决策**，
 * 不是遗漏。把决策做成有名字、有出处、可测试的政策对象，后来者才不会把
 * "这里没有可用性检查"误读为待补的功能缺口（那正是当初分叉的成因）。
 * 未来出现"要求即时封禁"需求时，替换 implementation 为守卫层缓存校验
 * （路线 ①），消费方不改。
 */

import { Injectable } from '@nestjs/common';

/** 政策常量：TTL 内是否做客户可用性校验。当前唯一合法值为 `false`。 */
export const CUSTOMER_AVAILABILITY_CHECKED_WITHIN_TTL = false;

/** 政策契约：回答"TTL 内是否校验客户可用性"及其依据。 */
export interface CustomerAvailabilityPolicy {
  /** TTL 内是否校验客户可用性（存在性 / `status` / `deletedAt`）。 */
  checksWithinTtl(): boolean;
  /** 政策出处（便于审计与文档关联）。 */
  source(): string;
}

/**
 * 默认 implementation：与 ADR 0011 决策 3 + 统一注记一致——TTL 内不校验。
 */
@Injectable()
export class AccessTtlNoCheckPolicy implements CustomerAvailabilityPolicy {
  checksWithinTtl(): boolean {
    return CUSTOMER_AVAILABILITY_CHECKED_WITHIN_TTL;
  }

  source(): string {
    return 'adr-0011:decision-3+availability-note';
  }
}

/**
 * `AvailabilityGate` 适配 seam（T8）：守卫边界上的可用性断言点。
 *
 * 当前 no-op implementation（与政策一致放行）。未来切换路线 ① 时，替换为
 * 带缓存的 implementation 即可，`CustomerJwtGuard` / `CustomerJwtStrategy`
 * 与全部写路径无需改动。
 */
export interface AvailabilityGate {
  /** TTL 内的可用性断言；当前 no-op。 */
  assertWithinTtl(customerId: string): Promise<void>;
}

/** DI token：按接口注入，使守卫不绑定具体 implementation。 */
export const AVAILABILITY_GATE = Symbol('AVAILABILITY_GATE');

@Injectable()
export class NoopAvailabilityGate implements AvailabilityGate {
  async assertWithinTtl(_customerId: string): Promise<void> {
    // 政策：TTL 内不校验（见 CustomerAvailabilityPolicy）。刻意为空实现，
    // 不是 TODO —— 消除"这里是不是漏了校验"的歧义正是本 module 的职责。
    return;
  }
}
