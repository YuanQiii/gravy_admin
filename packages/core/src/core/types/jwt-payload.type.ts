export type JwtPayload = {
  sub: string; // userId
  jti: string; // token unique id，用于登出时定位 RT
  // 认证域声明（'user' | 'customer'）。后台 `JwtStrategy` 对 realm !== 'user'
  // （含缺失 realm）一律拒绝（ADR 0011 收紧，缺 realm 兼容窗口已移除）；客户
  // `CustomerJwtStrategy` 要求 realm === 'customer'。
  realm?: string;
  username: string;
  nickname: string;
  email?: string | null;
  avatar?: string | null;
  status: string;
  roleKeys: string[]; // IUser.roles[].roleKey 数组，用于守卫判断
  iat: number;
  exp: number;
};
