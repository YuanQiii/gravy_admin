import { Global, Module } from '@nestjs/common';
import {
  AccessTtlNoCheckPolicy,
  AVAILABILITY_GATE,
  NoopAvailabilityGate,
} from './customer-availability.policy';

/**
 * 客户可用性政策 module：提供 `CustomerAvailabilityPolicy`（单一来源）
 * 与 `AvailabilityGate`（守卫边界适配 seam，当前 no-op，按
 * `AVAILABILITY_GATE` token 注入使消费方不绑定实现）。
 *
 * **必须 `@Global()`**：`CustomerJwtGuard` 被 `@UseGuards(类引用)` 用在多个
 * 模块的控制器上，Nest 会在**各控制器所属模块**的注入器里实例化守卫 ——
 * 政策 provider 若只在 CustomerAuthModule 局部可见，那些模块解析守卫依赖时
 * 会在请求期 500（而非启动期报错）。全局注册使守卫在任意上下文都能拿到
 * AvailabilityGate。未来切换"即时封禁"路线时，只替换这里的 provider。
 */
@Global()
@Module({
  providers: [
    AccessTtlNoCheckPolicy,
    { provide: AVAILABILITY_GATE, useClass: NoopAvailabilityGate },
  ],
  exports: [AccessTtlNoCheckPolicy, AVAILABILITY_GATE],
})
export class CustomerAvailabilityModule {}
