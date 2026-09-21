# DTO 与 Swagger 规范

DTO 是前后端契约，字段、必填状态、类型和响应结构必须通过 Swagger 明确表达。

## 注解规则

| 场景 | 注解 | 要求 |
|------|------|------|
| 必填字段 | `@ApiProperty()` | 必须有 `description`，建议有 `example` |
| 可选字段 | `@ApiPropertyOptional()` | 必须配合 `@IsOptional()` |
| 字符串 | `type: 'string'` | 建议给 example |
| 整数 | `type: 'integer'` | 使用 `@IsInt()` |
| 布尔 | `type: 'boolean'` | 使用 `@IsBoolean()` 或明确转换策略 |
| 数组 | `type: [String]` / `[Number]` | 校验 `each: true` |
| 枚举 | `enum: SomeEnum` | example 使用枚举值 |
| 日期时间 | `type: 'string', format: 'date-time'` | 响应中常见 |
| 嵌套对象 | `type: XxxResponseDto` | 响应用 `@Type()` |
| 嵌套数组 | `type: [XxxResponseDto]` | 响应用 `@Type()` |

## 请求 DTO

全局启用 `EmptyStringTransformPipe` 和 `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`：未声明字段被拒绝，空字符串转为 `null`。

```typescript
export class CreateUserDto {
  @ApiProperty({ description: '用户名', example: 'admin', type: 'string' })
  @IsString() @MinLength(3)
  username: string;

  @ApiPropertyOptional({ description: '邮箱', example: 'admin@example.com', type: 'string' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiProperty({ description: '状态', enum: UserStatus, example: UserStatus.ENABLED })
  @IsEnum(UserStatus)
  status: UserStatus;
}
```

Update DTO 通常继承 Create DTO 并排除不可修改字段：`extends PartialType(OmitType(CreateUserDto, ['password'] as const))`。
Query DTO 通常继承 `PaginationSortDto`，查询条件全部可选。

## 响应 DTO

- 每个对外字段必须有 `@ApiProperty()` 或 `@ApiPropertyOptional()`。
- 暴露字段用 `@Expose()`，隐藏字段用 `@Exclude()`；对外暴露业务 UUID（如 `userId`），不暴露数据库自增 `id`。
- 敏感字段（尤其 `password`、token、secret）不能出现在响应 DTO 中。
- 嵌套对象用 `@Type(() => XxxResponseDto)`，兼容 `null` 或转换 Prisma 关联结构时使用 `@Transform()`。
- 使用 `plainToInstance(XxxResponseDto, data, { excludeExtraneousValues: true })` 确保转换生效。
- Prisma 查询优先用 `select` 排除敏感字段；DTO 是第二道防线。

## 禁止事项

- 禁止 DTO 裸字段没有 Swagger 注解。
- 禁止必填字段使用 `@ApiPropertyOptional()`。
- 禁止数组、枚举、数字、布尔、日期不标 `type` 或 `enum`。
- 禁止响应 DTO 出现 `password`、token、secret 等敏感字段。
- 禁止响应 DTO 暴露数据库自增 `id`。
- 禁止把 Prisma 模型完整复制成响应 DTO。

## 公开接口 Swagger 标注

- 公开 GET 接口（`@Public()`）的 `@ApiOperation` 须加 `description: '公开接口，无需认证'`，便于 Swagger UI 识别。
- 公开接口不加方法级 `@ApiBearerAuth()`；类级保留以覆盖其他受保护方法。
- 公开接口复用现有 `*ResponseDto`，不创建 public 专用 DTO 变体。

## 导出契约供前端联调

Swagger 由 `SwaggerModule.setup('api', ...)` 挂载（见各 `apps/<app>/src/main.ts`），NestJS 自带三个端点，**无需额外代码**即可取到契约：

| 端点 | 内容 |
|------|------|
| `/{app}/api` | Swagger UI |
| `/{app}/api-json` | OpenAPI 3.0 JSON |
| `/{app}/api-yaml` | OpenAPI 3.0 YAML |

一键导出（拉取运行实例的 `/api-json` 与 `/api-yaml`，落到 `openapi/<app>.json|yaml`）：

```bash
pnpm openapi:export                                    # 默认 admin=3000、mall=3001
pnpm openapi:export -- --admin http://127.0.0.1:3001 --mall http://127.0.0.1:3000
ADMIN_API_URL=... MALL_API_URL=... pnpm openapi:export
```

约定与注意事项：

- **导出的是运行实例的契约，不是工作区最新代码。** 改了 DTO/Controller 后须重启对应应用再导出，否则交给前端的文档是旧的；脚本会在任一应用取不到契约时以非零码退出，便于 CI 串联。
- 用「拉取运行实例」而非「离线构建 document」是刻意的：`DocumentBuilder` 配置写在 `main.ts` 的 bootstrap 内且未导出，离线重建会形成第二份真相。
- 两个应用的 dev 端口默认都是 3000（各自 `.env.development` 的 `PORT`）。本地同时起两个时，用 `PORT=3001 pnpm start:mall:dev` 覆盖；`pnpm docker:dev:up` 已按 `MALL_PORT`（默认 3001）区分。
- 产物可导入 Apifox / Postman（OpenAPI 3.0），或用于生成前端类型；是否入库由团队决定（当前未加入 `.gitignore`）。
