/**
 * B2C 客户身份（由 `CustomerJwtStrategy` 校验 `realm==='customer'` 后产出）。
 */
export interface ICustomer {
  customerId: string;
}