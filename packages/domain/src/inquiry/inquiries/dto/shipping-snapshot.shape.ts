/**
 * 收货地址快照的字段集 —— 「快照存在、字段集不漂移」这件事的单一真值。
 *
 * 两个消费方 `implements` / 引用它：
 * - `InquiryResponseDto`（暴露面）：少一个字段或类型不匹配 → **编译失败**；
 * - `InquiriesService.resolveShippingSnapshot`（写入面）：返回值类型即本接口。
 *
 * 快照语义：创建时点冻结，不随 `CustomerAddress` 的修改或删除漂移。
 * 迁移 SQL 无法被 TS 约束，由变更 `snapshot-inquiry-shipping-address` 的 tasks 覆盖。
 *
 * 放在 `dto/` 而不是 inquiries.service.ts：DTO 需要引用它，而 service 已经引用 DTO；
 * 把接口留在 service 会让 DTO 反向依赖 service（层序倒置）。本文件是两者共同的下游。
 *
 * 字段为**必填且可为 null**（而非可选）：响应投影的入参始终是 inquiries 的整行，
 * Prisma 对可空列返回 `null` 而非 `undefined`，因此"字段在场、值可为 null"是准确契约。
 */
export interface ShippingSnapshotShape {
  shippingReceiver: string | null;
  shippingPhone: string | null;
  shippingProvince: string | null;
  shippingCity: string | null;
  shippingDistrict: string | null;
  shippingDetailAddress: string | null;
  shippingZipCode: string | null;
}

/**
 * 快照字段名的**运行时**清单（测试断言线上的键集合时用它 —— 接口本身没有运行时形态）。
 *
 * `satisfies` 保证清单里的每个名字都是真实字段；下面的穷尽性断言反向保证
 * **接口里的每个字段都在清单里** —— 给 shape 加字段而忘了加清单，本文件编译失败。
 * 于是"字段集"同时有了编译期与运行时两个真值，且两者互为守门人。
 */
export const SHIPPING_SNAPSHOT_KEYS = [
  'shippingReceiver',
  'shippingPhone',
  'shippingProvince',
  'shippingCity',
  'shippingDistrict',
  'shippingDetailAddress',
  'shippingZipCode',
] as const satisfies readonly (keyof ShippingSnapshotShape)[];

type MissingSnapshotKey = Exclude<
  keyof ShippingSnapshotShape,
  (typeof SHIPPING_SNAPSHOT_KEYS)[number]
>;
// 若此断言失败：接口新增了字段但未加入 SHIPPING_SNAPSHOT_KEYS
const _snapshotKeysAreExhaustive: MissingSnapshotKey extends never ? true : never =
  true;
void _snapshotKeysAreExhaustive;
