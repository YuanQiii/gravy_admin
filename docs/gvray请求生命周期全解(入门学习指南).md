# GVRAY Admin 请求生命周期全解 —— 零基础入门学习指南

> 这份文档把之前画的 **4 张图**（架构总览、JWT 认证、数据访问与缓存、请求生命周期）**综合到一起**，
> 并且**补充了缺的部分**，用**最通俗的话**讲清楚：**当你在浏览器里点了一下按钮，后端到底发生了什么。**
>
> 阅读方式：如果你是**小白**，请**顺序往下读**，每一节都想象成"看监控录像回放"。
> 我会在每段代码旁边**加注释**，并告诉你每个概念"可以把它想象成什么"。

***

## 目录

- [第 0 章 先用 5 分钟建立"地图感"](#第-0-章-先用-5-分钟建立地图感)

- [第 1 章 整体架构：这个系统由哪些"零件"组成](#第-1-章-整体架构这个系统由哪些零件组成)

- [第 2 章 一次请求的生命周期（主线剧情）](#第-2-章-一次请求的生命周期主线剧情)

- [第 3 章 登录与身份验证：JWT 是怎么一回事](#第-3-章-登录与身份验证jwt-是怎么一回事)

- [第 4 章 权限检查：谁能看、谁能改（RBAC）](#第-4-章-权限检查谁能看谁能改rbac)

- [第 5 章 数据读取与缓存：成绩单为什么要抄一份放门口](#第-5-章-数据读取与缓存成绩单为什么要抄一份放门口)

- [第 6 章 统一出口：成功的响应和出错的响应](#第-6-章-统一出口成功的响应和出错的响应)

- [第 7 章 把一切串起来：讲一个完整的故事](#第-7-章-把一切串起来讲一个完整的故事)

- [第 8 章 自查题 + 常见困惑](#第-8-章-自查题--常见困惑)

***

## 第 0 章 先用 5 分钟建立"地图感"

先记住 4 个最基础的角色（想象成一个**饭店**的例子）：

| 术语                  | 饭店例子              | 官方叫法             |
| ------------------- | ----------------- | ---------------- |
| **客户端**（浏览器/手机 App） | 来吃饭的**客人**        | Client           |
| **控制器 Controller**  | 前台**服务员**：只管接单、传话 | Controller       |
| **服务 Service**      | 后厨**大厨**：真正干活     | Service          |
| **数据库 / 缓存**        | 仓库里的**食材 + 备好的菜** | Database / Redis |

一次请求就像一个**客人点菜 → 服务员接单 → 传话给后厨 → 后厨做菜 → 服务员端菜**的过程。

我们项目的技术栈是：**NestJS 11 + TypeScript + Prisma + PostgreSQL + Redis + JWT**。
不用紧张，下面会逐个解释。

> 💡 **小提示**：遇到不认识的英文缩写，先看它"负责什么"，不用死记术语本身。

***

## 第 1 章 整体架构：这个系统由哪些"零件"组成

> 对应你生成的 **`gvray-architecture.html`**（架构图）。

### 1.1 三层大格局（想象成一栋三层楼）

```
┌─────────────────────────────────────────────┐
│  第 1 层  客户端（Client）                    │
│  浏览器 / Postman / 手机 App，负责"发起请求"   │
└───────────────┬─────────────────────────────┘
                │ HTTP 请求（带着 JWT token）
                ▼
┌─────────────────────────────────────────────┐
│  第 2 层  NestJS Admin 应用（后端核心业务）    │
│  ┌───────────────────────────────────────┐  │
│  │ 入口层：CORS / 全局管道                 │  │
│  │ 守卫层：FeatureFlag → Throttler →      │  │
│  │        AccessGuard(Jwt→Roles→Perms)   │  │
│  │ 控制器 + 服务层：到底做啥事              │  │
│  └───────────────────────────────────────┘  │
└───────────────┬─────────────────────────────┘
                │ 查询 / 写入
                ▼
┌─────────────────────────────────────────────┐
│  第 3 层  数据 / 缓存层                       │
│  PostgreSQL（Postgres 数据库，存最终答案）    │
│  Redis（缓存，存"答案的复印件"，快）           │
└─────────────────────────────────────────────┘
```

### 1.2 项目里"零件"长什么样

对应关系（方便你以后去翻代码）：

| 概念        | 代码位置                                                                                  | 一句话职责                   |
| --------- | ------------------------------------------------------------------------------------- | ----------------------- |
| 应用入口      | [src/main.ts](file:///c:/Project/gvray/src/main.ts)                                   | 组装一切、启动服务器              |
| 全局装配      | [src/app.module.ts](file:///c:/Project/gvray/src/app.module.ts)                       | 告诉 Nest"全局要装哪些东西"       |
| 供应商(阿里)模块 | `src/modules/system/`、`src/modules/equipment/` 等                                      | 一个个业务模块（用户、设备、询价…）      |
| 数据库访问     | [src/prisma/prisma.service.ts](file:///c:/Project/gvray/src/prisma/prisma.service.ts) | 用 Prisma 查 Postgres     |
| Redis 缓存  | [src/redis/redis.service.ts](file:///c:/Project/gvray/src/redis/redis.service.ts)     | 对 Redis 作基础操作           |
| 通用缓存封装    | [src/redis/cache.service.ts](file:///c:/Project/gvray/src/redis/cache.service.ts)     | 在 Redis 之上做"自动 JSON 存取" |

> 📖 **"模块"是什么？** 可以把模块想象成**一个部门的文件夹**：每个部门（模块）有自己
> 的"接待（Controller）"、"干活的人（Service）"、"规定（DTO）"。NestJS 把"部门"组织起来组成公司（App）。

***

## 第 2 章 一次请求的生命周期（主线剧情）

> 对应你生成的 **`gvray-request-lifecycle.html`**（生命周期图）。

这是**最核心的一张图**。我们把一次请求拆成 **7 步**，每一步都对应真实代码。

```
走到门口                前台登记        核对身份       核对证件       干活      上菜
[1]HTTP到达 → [2]全局守卫 → [3]路由守卫鉴权 → [4]DTO校验 → [5]业务处理 → [6]统一响应
                                      │                    │
                                      ▼                    ▼
                                      [7]异常捕获        [缓存]→[数据库]
```

### 第 1 步：HTTP 请求到达（入口）

**生活例子**：客人按了门铃。

代码：[main.ts](file:///c:/Project/gvray/src/main.ts) 里 `bootstrap()` 启动应用，并配置了 **CORS（跨域）**：

```typescript
// CORS = 跨域资源共享。
// 作用：浏览器出于安全，默认不允许"另一个网站"去请求我们的后端。
// 这句话就是说：我允许某些"来源(origin)"来访问我。
app.enableCors({
  origin: isDev ? true : corsOrigins, // 开发环境全放行；生产环境只放行配置里写的域名
  credentials: true,                   // 允许携带 Cookie
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',   // ⭐ 允许请求头里带这个（放 JWT token 的地方）
    'Content-Type',
    // ... 其余允许的头
  ],
});
```

同时，`main.ts` 里还设了 **全局管道（Pipes）**，你可以理解成"入口处的**自动安检机**"：

```typescript
// 全局管道：所有请求进来先经过这里
app.useGlobalPipes(
  new EmptyStringTransformPipe(),  // 第一步安检：把空字符串""整理一下（变成 null）
  new ValidationPipe({             // 第二步安检：校验请求参数是否合法
    whitelist: true,               // 只留下 DTO 声明的字段，多余的丢弃
    transform: true,               // 把参数转成 DTO 要求的类型
    forbidNonWhitelisted: true,    // 如果多传了没声明的字段，直接报错
  }),
);
```

> 💡 **验证管道的价值**：前端传来的 `"123"` 是字符串，DTO 想要数字，`transform: true`
> 会自动帮你转成数字 `123`。统一在"门口"做，就不用每个接口自己写一堆 `if` 判断。

### 第 2 步：全局守卫（两道"小区保安"）

**生活例子**：保安先在门口做两个最基本的检查。

代码：[app.module.ts](file:///c:/Project/gvray/src/app.module.ts) 里注册了两个 **全局守卫**：

```typescript
// 第 1 个全局守卫：FeatureFlagGuard（功能开关）
{ provide: APP_GUARD, useClass: FeatureFlagGuard },
// 第 2 个全局守卫：ThrottlerGuard（限流：防止有人疯狂刷接口）
{ provide: APP_GUARD, useClass: ThrottlerGuard },
```

| 守卫                 | 它管什么                             | 白话                 |
| ------------------ | -------------------------------- | ------------------ |
| `FeatureFlagGuard` | 只对打了 `@FeatureFlag(...)` 尾巴的接口生效 | 某个功能被"开关"关掉时，直接不让进 |
| `ThrottlerGuard`   | 限流，默认 1000 次/分钟/每个 IP            | 防止机器人刷爆服务器         |

> 📖 **NestJS 守卫运行的顺序**：多个全局守卫会按注册顺序执行。这一步的守卫**还没涉及"你是谁"**，
> 只是最基础的"功能有没有开放、有没有刷太快"。

### 第 3 步：路由守卫 · 身份与权限（最关键的一道门）

**生活例子**：要进 VIP 区，得查你**是谁（JWT）、有没有身份（角色）、有没有权限（许可证）**。

这是由 **`AccessGuard`**（一个"大管家")统一编排的。代码在
[access.guard.ts](file:///c:/Project/gvray/src/core/guards/access.guard.ts)：

```typescript
// 这是"统一守卫大管家"，它负责决定"走公开通道 还是 走安检通道"
if (isPublic) {
  // 情况一：这是"公开接口"（比如登录、查看公开页面）
  // → 只尝试帮你把"用户信息"装进 request.user，
  //   装不上（没带 token）也无所谓，按"匿名访客"放行。
  try {
    await this.jwtAuthGuard.canActivate(context); // 尽力填充用户
  } catch (err) {
    // 有 token 但无效 → 不拦截，只是当你是访客
  }
  return true; // 公开接口一律放行
}

// 情况二：这是"受保护接口" → 依次过 4 道安检，只要有一步不过就拦下
const guards = [
  this.jwtAuthGuard,     // ① 你的身份令牌有效吗？
  this.guestWriteGuard,  // ② 你是"游客"吗？游客不能写数据
  this.rolesGuard,       // ③ 你的"角色"够格吗？（管理员/普通用户）
  this.permissionsGuard, // ④ 你的"权限码"够吗？（能不能做这件事）
];
for (const guard of guards) {
  const ok = await guard.canActivate(context);
  if (!ok) return false;  // 一道没通过 → 整个拒绝
}
return true;
```

> 💡 **为什么用一个"大管家"编排，而不是每个接口自己写？** 以前 23 个接口都要自己写一行
> `@UseGuards(一堆守卫)`。现在收敛到 `AccessGuard` 一处，**顺序统一、改一处全生效**。

> 📖 这 4 道安检里，**第①、③、④** 我们会在 **第 3、4 章**详细展开。

### 第 4 步：DTO 校验

**生活例子**：你点的菜名要确认写对了，才能送到后厨。

这一步就是在 **第 1 步**装的 `ValidationPipe` 开始生效。用了 class-validator 的装饰器：

```typescript
// 一个 DTO（数据传输对象），就是"这接口允许接收哪些字段"的说明书
export class CreateUserDto {
  @IsString()          // 必须是字符串
  @IsNotEmpty()        // 不能为空
  username: string;

  @IsEmail()           // 必须是合法的邮箱格式
  email: string;

  @IsOptional()        // 这一项可以不带
  @MinLength(6)        // 如果带了，至少 6 位
  password?: string;
}
```

> 📖 **DTO 的好处**：参数不合法在这里就被拦下，**最前面的错误提示是统一的**，业务代码里就不用
> 每个字段自己去判断 `if (xxx == null)` 了。

### 第 5 步：业务处理（Controller → Service）

**生活例子**：服务员把菜单递给后厨，大厨真的动手做菜。

- **Controller**（[某个 controller.ts](file:///c:/Project/gvray/src/modules)）：只做三件事——**接路由、取参数、调 Service**。

- **Service**（对应的 `.service.ts`）：真正的逻辑在这里，比如"把数据存库、算价格、加日志"。

```typescript
@Controller('system/users') // 路由前缀：所有接口都在 /system/users/... 下
export class UsersController {
  // 构造器：Nest 自动把 UserService 注入进来（依赖注入，后面会讲）
  constructor(private readonly userService: UserService) {}

  @Get(':id')                     // GET /system/users/:id
  @Permissions('system:user:read')// 需要这个权限码才能访问
  async getProfile(@Param('id') id: string) {
    // 控制器不写业务逻辑，只"传话"
    return this.userService.findOne(id);
  }
}
```

> 💡 **依赖注入（Dependency Injection）是什么？**
> 不用你自己 `new UserService()`，Nest 在你需要的时候**自动送一个现成的进来**。
> 就像你不需要自己去买菜，后厨会配好菜给你。好处：好测试、好复用、解耦。

### 第 6 & 7 步：统一出口（成功响应 + 异常捕获）

**生活例子**：菜做好，服务员用一个"标准餐盘"端出来；如果做砸了，也用一个"标准错误餐盘"端出来。

这两步由\*\*拦截器（Interceptor）**和**过滤器（Filter）\*\*负责，详见第 6 章。

***

## 第 3 章 登录与身份验证：JWT 是怎么一回事

> 对应你生成的 **`gvray-auth-flow.html`**（认证流程图）。

### 3.1 先剔除一个常见误解：JWT 是"凭证"，不是"查数据库"

JWT（JSON Web Token）就是一张**写了字的身份证**。它长得像这样：

```
eyJhbGciOiJIUzI1Ni... . eyJzdWIiOiIxMjMiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE2... . sQp4yYX...
```

分成三段（用 `.` 隔开）：

1. **头部(Header)**：说明用了什么算法加密。
2. **载荷(Payload)**：**核心内容**，就是写在上面的字（`userId`、`email`、`roleKeys`…）
3. **签名(Signature)**：用服务器保管的\*\*密钥(JWT\_SECRET)\*\*算出来的"防伪章"。

> 💡 **关键点**：验证 JWT 的时候，**不需要去数据库查**，只要用密钥算一下签名对得上、
> 没过期就行。所以它很快，也很适合"无状态"（服务器不用记住谁登录过）。

### 3.2 登录这个动作怎么走

当用户调 `POST /auth/login` 时（这一步是**公开接口**，所以都能进）：

1. 用户提交账号密码。
2. 后端（`AuthService`）核对账号密码对不对。
3. 对了 → 把关键信息打包进 JWT 载荷 → 用密钥签名 → 发回给前端。
4. 前端把这个 token **存起来**，每次请求都放在 `Authorization: Bearer <token>` 头里。

### 3.3 后端怎么"读"token：JwtStrategy

代码在 [jwt.strategy.ts](file:///c:/Project/gvray/src/core/strategies/jwt.strategy.ts)：

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // 从 Authorization 头里取 token
      ignoreExpiration: false,      // token 过期就拒绝
      secretOrKey: configService.get<string>('jwt.secret'),     // 用这个密钥验证签名
    });
  }

  // token 验证通过后，会调用这个 validate 方法
  async validate(payload: JwtPayload): Promise<IUser> {
    // payload 就是 token 里"写的字"
    if (!payload?.sub || !payload.roleKeys) {
      throw new UnauthorizedException('无效的 Access Token');
    }
    if (!payload.status || payload.status !== UserStatus.ENABLED) {
      throw new UnauthorizedException('用户已被禁用'); // 被禁用的用户不许进
    }
    // 把 payload 转成一个标准的"当前用户 IUser"对象，挂到 request.user 上
    return { userId: payload.sub, roles: payload.roleKeys.map(...), ... };
  }
}
```

### 3.4 JwtAuthGuard 是"谁"？

代码在 [jwt-auth.guard.ts](file:///c:/Project/gvray/src/core/guards/jwt-auth.guard.ts)：

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

就这么一句。它表示：**启用名为** **`'jwt'`** **的 Passport 策略（就是上面的 JwtStrategy）**。
它干的事是：

1. 从请求头取出 token；
2. 调用 `JwtStrategy.validate` 验证并解析出用户；
3. 把用户对象塞进 `request.user`；
4. 失败就抛 `UnauthorizedException`（401）。

> 📖 所以登录页之后，只要带了正确 token，`AccessGuard` 的第①道安检就过了。

***

## 第 4 章 权限检查：谁能看、谁能改（RBAC）

> 对应你生成的 **`gvray-auth-flow.html`** 里的"角色/权限"部分。

### 4.1 RBAC 是什么

**RBAC = 基于角色的访问控制（Role-Based Access Control）**。

一句话版本：**"张三能干嘛" 不看张三本身，而是看"张三是什么角色"，角色有哪些权限**。

- 用户（User）

- 角色（Role）：比如 `admin`（管理员）、`guest`（游客）

- 权限（Permission）：具体某件事，比如 `system:user:create`（创建用户）

关系：**用户 →（拥有）→ 角色 →（拥有）→ 权限**。

### 4.2 RolesGuard：检查"角色够不够格"

代码在 [roles.guard.ts](file:///c:/Project/gvray/src/core/guards/roles.guard.ts)：

```typescript
canActivate(context: ExecutionContext): boolean {
  // 读取接口上用 @Roles / @DenyRoles 声明的元数据（要求/禁止哪些角色）
  const requiredRoles = this.reflector.getAllAndOverride(ROLES_KEY, ...);
  const deniedRoles = this.reflector.getAllAndOverride(DENY_ROLES_KEY, ...);

  if (!requiredRoles && !deniedRoles) {
    return true; // 这个接口没声明任何角色要求 → 直接放行
  }

  // 取当前用户的角色 key 列表（来自 request.user）
  const { user } = context.switchToHttp().getRequest();
  const userRoleKeys = (user.roles || []).map(r => r.roleKey);

  // 如果用户"恰好是禁止的角色" → 拒绝
  if (deniedRoles?.roles.some(rk => userRoleKeys.includes(rk))) {
    throw new ForbiddenException(deniedRoles.message ?? '禁止访问'); // 403
  }

  // 如果没要求特定角色 → 放行
  if (!requiredRoles) return true;

  // 用户角色里"只要有任意一个"要求的角色 → 放行
  const hasRole = requiredRoles.roles.some(rk => userRoleKeys.includes(rk));
  if (!hasRole) throw new ForbiddenException(requiredRoles.message ?? '暂无权限访问');

  return true;
}
```

> 💡 **`@Roles('admin')`** **代表"只要你是 admin 就行"**；`@DenyRoles('guest')` 代表"只要你是 guest 就禁止"。

### 4.3 PermissionsGuard：检查"具体这件事有没有权限"

这是最精细的一层。代码在 [permissions.guard.ts](file:///c:/Project/gvray/src/core/guards/permissions.guard.ts)：

```typescript
async canActivate(context: ExecutionContext): Promise<boolean> {
  // 接口声明需要的权限码，比如 ["system:user:create"]
  const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
    PERMISSIONS_KEY, ...,
  );
  if (!requiredPermissions) return true;

  const request = context.switchToHttp().getRequest();
  const userId = request.user?.userId;
  if (!userId) return false; // 连 user 都没有 → 拒绝

  // ⭐ 超级管理员旁路：如果用户是 super_admin，直接放行，不用查权限列表
  const roleKeys = (request.user?.roles ?? []).map(r => r.roleKey);
  if (isSuperAdminOf(roleKeys)) return true;

  // 1) 先从"Redis 权限缓存"拿权限（快）
  let userPermissions = await this.permissionCache.get(userId);

  // 2) 缓存没命中 → 去数据库查，并回填缓存
  if (!userPermissions) {
    userPermissions = await this.loadPermissionsFromDb(userId);
    if (userPermissions) await this.permissionCache.set(userId, userPermissions);
  }

  if (!userPermissions || userPermissions.length === 0) return false;

  // 3) 要求的权限必须"全部都拥有"
  const hasPermission = requiredPermissions.every(p => userPermissions.includes(p));
  return hasPermission;
}
```

看数据库那边是怎么查的（`loadPermissionsFromDb`）：通过
`用户 → 用户与角色关联表 → 角色 → 角色与权限关联表 → 权限` 一路连表查出来，再提取成权限码数组。

> 💡 **为什么权限要缓存？** 因为"连查 3 张关联表"挺慢。登录的人权限一般短时间内不变，
> 抄一份放 Redis 里，1 小时内不用反复查数据库。改权限时再失效缓存（见第 5 章）。

***

## 第 5 章 数据读取与缓存：成绩单为什么要抄一份放门口

> 对应你生成的 **`gvray-data-cache.html`**（数据访问与缓存流程图）。

### 5.1 为什么需要缓存

- **PostgreSQL**：是"最终正确答案仓库"，但每次查都要走磁盘，慢。

- **Redis**：是"内存里放复印件的地方"，超快。

策略就叫 **Cache-Aside（旁路缓存 / 先查缓存）**：

```
要查数据
   │
   ▼
Redis 里有吗？─────是──→ 直接返回，完事（快！）
   │否
   ▼
去 PostgreSQL 查（真正的答案）
   │
   ▼
把答案抄一份写进 Redis（回填），下次就快了
   │
   ▼
返回答案
```

### 5.2 三层缓存代码

- **低层**：[redis.service.ts](file:///c:/Project/gvray/src/redis/redis.service.ts) —— 是对 Redis 客户端的基础封装，
  负责连接、断线、加 key 前缀、以及在 Redis 不可用时抛出 `RedisUnavailableError`。

- **中层**：[cache.service.ts](file:///c:/Project/gvray/src/redis/cache.service.ts) —— 在 Redis 之上加"自动 JSON 序列化"：

```typescript
async get<T>(key: string): Promise<T | null> {
  const raw = await this.redis.get(key);
  if (raw === null) return null;
  return JSON.parse(raw) as T; // 存进去的是字符串，取出来帮你还原成对象
}

async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const serialized = JSON.stringify(value); // 对象 → 字符串
  await this.redis.set(key, serialized, { ttlSeconds });
}
```

> 📖 注意 `cache.service.ts` 里每个方法的 `catch` 都有：
> `if (e instanceof RedisUnavailableError) return null;`
> 这叫 **fail-open（故障时放行）**：Redis 挂了，我不让你报错，而是退回"直接查数据库"。

- **高层**：业务 Service 层的调用，比如：

```typescript
async findSomething(id: string) {
  const cached = await this.cacheService.get(`item:${id}`);
  if (cached) return cached;      // 命中缓存 → 直接返回

  const data = await this.prisma.item.findUnique({ where: { id } }); // 未命中 → 查库
  await this.cacheService.set(`item:${id}`, data, 3600);            // 回填缓存(1h)
  return data;
}
```

### 5.3 权限缓存的"失效"：PermissionCacheService

改角色 / 改权限后，缓存的复印件就"过期"了，必须删掉旧缓存，否则用户下次进来还是旧权限。

代码在 [permission-cache.service.ts](file:///c:/Project/gvray/src/redis/permission-cache.service.ts)：

```typescript
// 按权限反查所有受影响用户，删掉他们的权限缓存
async invalidateUsersByPermissionIds(permissionIds: string[]): Promise<number> {
  // 1. 权限 → 找到用了它的角色 roleIds
  // 2. 角色 → 找到属于这些角色的用户 userIds
  // 3. 逐个删除每个用户的权限缓存
  // 返回受影响的用户数（用于日志观测）
}
```

> 💡 这叫**反向检索**：因为权限变化会"连带"影响一串用户，所以要**权限 → 角色 → 用户**地反查。

***

## 第 6 章 统一出口：成功的响应和出错的响应

无论接口成功还是失败，**返回给前端的结构必须长一个样**，前端才好统一处理。

### 6.1 成功响应：ResponseInterceptor

代码在 [response.interceptor.ts](file:///c:/Project/gvray/src/core/interceptors/response.interceptor.ts)。它会在 Controller 返回后，自动"包装"一层：

```typescript
return next.handle().pipe(
  map((data) => {
    // 如果接口自己已经返回了统一格式，不重复包装
    if (this.isApiResponse(data)) return data;

    // 根据 HTTP 方法选不同的"提示语"
    switch (request.method) {
      case 'POST':   return ResponseUtil.created(data);        // 创建成功
      case 'PUT':
      case 'PATCH':  return ResponseUtil.updated(data);        // 更新成功
      case 'DELETE': return ResponseUtil.deleted(data);        // 删除成功
      default:       return ResponseUtil.found(data);          // 查询成功
    }
  }),
);
```

统一成功格式长这样（来自 [response.util.ts](file:///c:/Project/gvray/src/shared/utils/response.util.ts)）：

```json
{
  "success": true,
  "code": 200,
  "message": "操作成功",
  "data": { "id": "xxx", "name": "张三" },
  "timestamp": "2026-09-02T12:00:00.000Z"
}
```

> 📖 分页接口会返回 `data.items` / `data.total` / `data.page` / `data.pageSize`。

### 6.2 出错响应：HttpExceptionFilter

代码在 [http-exception.filter.ts](file:///c:/Project/gvray/src/core/filters/http-exception.filter.ts)。它是"捕网"，把接口抛出的任何异常接住并归一化：

```typescript
@Catch()  // 捕获所有异常
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      // 从异常里取出 message（处理 "请求参数错误: xxx" 的拼接）
    } else if (exception instanceof Error) {
      status = 500; // 其他未知异常统一当成服务器内部错误
      message = exception.message;
    } else {
      status = 500;
      message = '未知错误';
    }

    // 日志：5xx 用 error（严重），4xx 用 warn（没那么严重）
    // 构建统一错误格式：success:false, code, message, showType
    response.status(status).json(errorResponse);
  }
}
```

统一错误格式：

```json
{
  "success": false,
  "code": 401,
  "message": "无效的 Access Token",
  "data": null,
  "timestamp": "2026-09-02T12:00:00.000Z",
  "showType": "NOTIFICATION"
}
```

> 💡 `showType`（错误展示类型）是给前端看的"该弹什么样式"：是弹通知、弹红字还是黄字。

***

## 第 7 章 把一切串起来：讲一个完整的故事

下面我们**完整走一遍**：**管理员张三** 在后台点了一下"查看用户详情"。

1. **浏览器**：张三的电脑发起 `GET /system/users/u-1001`，请求头带着他的 JWT token
   （`Authorization: Bearer eyJhbG...`）。
2. **入口**（main.ts）：CORS 检查允许 → 前后门经过全局管道（校验参数）。
3. **全局守卫**（app.module.ts）：FeatureFlag 功能开关开着 → Throttler 没超限。
4. **AccessGuard**（access.guard.ts）：这个接口不是公开的 → 依次过 4 道安检：

   - `JwtAuthGuard`：token 有效，解析出"张三是 admin，userId=u-1001"。

   - `GuestWriteGuard`：张三是登录用户不是游客，通过。

   - `RolesGuard`：接口要求 `@Roles('admin')`，张三是 admin，通过。

   - `PermissionsGuard`：接口要求 `system:user:read`。先查 Redis 权限缓存 → 命中（张三权限抄件在）→ 有该权限，通过。
5. **DTO 校验**：`id` 参数合法。
6. **Controller → Service**：`UsersController.getProfile` 调 `UserService.findOne`。
7. **数据访问**：Service 先查缓存 `user:u-1001` → 没命中 → 查 PostgreSQL → 回填缓存。
8. **统一响应**：`UserService` 返回数据 → `ResponseInterceptor` 自动包成统一格式 → 浏览器收到
   `{ success:true, data:{...}, code:200, ... }`。

张三看到页面，全程不到几秒。**如果中途哪一步的角色/权限/缓存不对**，就会走"异常过滤器"，
返回统一错误格式，张三会在页面上看到一个统一的错误弹窗。

> 📖 这个故事就是**第 1 章结构 + 第 2 章主线 + 第 3、4 章安检 + 第 5 章数据 + 第 6 章出口**
> 的总和。四张图讲的根本是**同一件事**：一个请求从进来到出去的过程。

***

## 第 8 章 自查题 + 常见困惑

### 一、自查题（答得上来说明你懂了）

1. Controller 和 Service 各自负责什么？为什么 Controller 不写业务逻辑？
2. 什么叫"公开接口"？`AccessGuard` 对公开接口做了什么事（和不公开接口有什么不同）？
3. JWT 验证时要不要查数据库？为什么？
4. `@Roles('admin')` 和 `@Permissions('system:user:read')` 的区别是什么？
5. 为什么先查 Redis 再查数据库？这段逻辑在代码里叫什么（Cache-Aside）？
6. Redis 挂了会不会导致整个系统崩溃？为什么（fail-open）？
7. 改了某个权限后，为什么之前的缓存要"作废"（invalidate）？

### 二、常见困惑

**Q1：为什么会有"守卫(Guard)"和"拦截器(Interceptor)"两个东西？**
A：时序不同。**Guard 在进入处理器之前**执行（是用来"决定让不让进"的）；
**Interceptor 包住处理器的前后**执行（还能改"出去的数据"）。响应包装就是 Interceptor 干的。

**Q2：`@Permissions`** **到底写在哪？**
A：写在 **Controller 的方法上**。权限码是 `{模块}:{资源}:{动作}` 的字符串常量，
定义在 [permissions.constant.ts](file:///c:/Project/gvray/src/shared/constants/permissions.constant.ts)，不硬编码。

**Q3：为什么数据库用** **`select`** **排除** **`password`？**
A：安全。项目硬规则：**永远不要把密码、token 返回给前端**。查用户时用 `select` 挑字段，
返回前再用 DTO + `plainToInstance` 控制结构，避免把不该给的东西漏出去。

**Q4：Redis 里的 key 为什么要加前缀？**
A：避免和其他应用共用同一 Redis 时的 key 冲突（看到 `gvr:xxx`、`perm:user:xxx` 就是加了前缀）。

**Q5：我改了代码，怎么跑起来看效果？**
A：开发环境 `pnpm start:dev`（自动监听改代码重启）。改 schema 先 `pnpm prisma:generate`。
（注意：改数据库结构/迁移这类破坏性命令要经过确认才能跑。）

***

> 🏁 \*\*恭喜你！\*\*你已经走完了 GVRAY 后端的一次完整闭环。接下来建议你：
>
> 1. 打开 [gvray-request-lifecycle.html](file:///c:/Project/gvray/.archify/gvray-request-lifecycle.html)，
>    对照本文第 2 章再"过一遍电影"。
> 2. 打开另外三张图（架构 / 认证 / 缓存），对照第 1、3、4、5 章。
> 3. 挑一个真的接口，自己 `pnpm start:dev` 起来用 Postman 打一下，看日志一步步走。

