/**
 * 询价单域常量
 * 枚举值统一使用小写，匹配项目 status 风格（源库大写枚举值迁移时转小写）
 */

// ==================== 询价单状态 ====================
export const INQUIRY_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  QUOTED: 'quoted',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export type InquiryStatus =
  (typeof INQUIRY_STATUS)[keyof typeof INQUIRY_STATUS];

export const INQUIRY_STATUS_VALUES = Object.values(INQUIRY_STATUS);

// ==================== 状态流转矩阵 ====================
// key: 当前状态，value: 合法的下一状态集合
//
// 本表与下面的 `buildStatusPatch` 共同构成「状态流转」这一个 module 的两半：
// 这里回答"哪些流转合法"，那里回答"流转要写哪些字段"。历史上二者分居两处、
// 且字段映射由两个调用方各写一遍，直接导致「状态与时间戳互斥」的非法态无人负责。
export const INQUIRY_STATUS_TRANSITIONS: Record<
  InquiryStatus,
  InquiryStatus[]
> = {
  [INQUIRY_STATUS.DRAFT]: [
    INQUIRY_STATUS.SUBMITTED,
    INQUIRY_STATUS.CANCELLED,
  ],
  [INQUIRY_STATUS.SUBMITTED]: [
    INQUIRY_STATUS.QUOTED,
    INQUIRY_STATUS.CANCELLED,
  ],
  [INQUIRY_STATUS.QUOTED]: [INQUIRY_STATUS.EXPIRED],
  [INQUIRY_STATUS.EXPIRED]: [],
  [INQUIRY_STATUS.CANCELLED]: [],
};

/**
 * 校验状态流转是否合法
 * @param from 当前状态
 * @param to 目标状态
 * @returns 是否允许流转
 */
export function isValidStatusTransition(from: string, to: string): boolean {
  const allowed = INQUIRY_STATUS_TRANSITIONS[from as InquiryStatus];
  return !!allowed && allowed.includes(to as InquiryStatus);
}

/**
 * 状态 → 时间戳字段的唯一映射（**不变量：状态与时间戳必须一致**）。
 *
 * - `submitted` → `submittedAt = now`
 * - `quoted`    → `quotedAt = now`，并在给了 `expiresAt` 时一并写入
 * - `cancelled` → `cancelledAt = now`
 * - `expired` / `draft` → 不产生新时间戳
 *
 * `expiresAt` 只在 `quoted` 且传了值时才写（不传表示"不改动"，而不是"清空"）；
 * `updatedById` 只在**非 undefined** 时并入（`null` 是合法值，表示清空操作人）。
 *
 * **不要把它内联回调用方**：状态与时间戳分家正是本仓曾经的缺陷形态
 * （并发 submit × cancel 可写出 `status = submitted ∧ cancelledAt ≠ null`）。
 */
export function buildStatusPatch(
  toStatus: InquiryStatus,
  ctx: {
    now: Date;
    expiresAt?: string | Date | null;
    updatedById?: string | null;
  },
): {
  status: InquiryStatus;
  submittedAt?: Date;
  quotedAt?: Date;
  cancelledAt?: Date;
  expiresAt?: Date;
  updatedById?: string | null;
} {
  const { now, expiresAt, updatedById } = ctx;
  return {
    status: toStatus,
    ...(toStatus === INQUIRY_STATUS.SUBMITTED ? { submittedAt: now } : {}),
    ...(toStatus === INQUIRY_STATUS.QUOTED
      ? {
          quotedAt: now,
          ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
        }
      : {}),
    ...(toStatus === INQUIRY_STATUS.CANCELLED ? { cancelledAt: now } : {}),
    ...(updatedById !== undefined ? { updatedById } : {}),
  };
}

// ==================== 询价单编号生成 ====================
export const INQUIRY_NO_PREFIX = 'INQ';
export const INQUIRY_NO_FORMAT = 'yyyyMM';
