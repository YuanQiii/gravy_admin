export type JwtPayload = {
  sub: string; // userId
  jti: string; // token unique id，用于登出时定位 RT
  // 认证域声明（'user' | 'customer'）。可选是为了兼容 realm 断言上线前
  // 已签发、未携带 realm 的历史后台 token（ADR 0010 一次性兼容）。
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
