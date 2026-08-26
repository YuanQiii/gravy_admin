/**
 * 客户域常量
 */

// ==================== 客户状态 ====================
export const CUSTOMER_STATUS = ['enabled', 'disabled'] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUS)[number];
