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
} as const;

export type InquiryStatus =
  (typeof INQUIRY_STATUS)[keyof typeof INQUIRY_STATUS];

export const INQUIRY_STATUS_VALUES = Object.values(INQUIRY_STATUS);

// ==================== 状态流转矩阵 ====================
// key: 当前状态，value: 合法的下一状态集合
export const INQUIRY_STATUS_TRANSITIONS: Record<
  InquiryStatus,
  InquiryStatus[]
> = {
  [INQUIRY_STATUS.DRAFT]: [INQUIRY_STATUS.SUBMITTED],
  [INQUIRY_STATUS.SUBMITTED]: [INQUIRY_STATUS.QUOTED],
  [INQUIRY_STATUS.QUOTED]: [INQUIRY_STATUS.EXPIRED],
  [INQUIRY_STATUS.EXPIRED]: [],
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

// ==================== 询价单编号生成 ====================
export const INQUIRY_NO_PREFIX = 'INQ';
export const INQUIRY_NO_FORMAT = 'yyyyMM';
