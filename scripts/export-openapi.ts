import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 导出 OpenAPI 契约（供前端联调 / 契约归档）。
 *
 * 为什么是「拉取运行实例」而不是「离线构建 document」：
 * Swagger 的 DocumentBuilder 配置（标题、描述、Bearer 认证）写在各自
 * `apps/<app>/src/main.ts` 的 bootstrap 内，并未对外暴露。离线重建要么复刻这份
 * 配置（两份真相，必然漂移），要么改动 main.ts 引出工厂；而直接拉 `/api-json`
 * 拿到的**恒等于运行时那份契约**（单一真相），与前端在 Swagger UI 上看到的完全一致。
 *
 * 用法：
 *   pnpm openapi:export
 *   pnpm openapi:export -- --admin http://127.0.0.1:3000 --mall http://127.0.0.1:3001
 *   ADMIN_API_URL=http://127.0.0.1:3000 MALL_API_URL=http://127.0.0.1:3001 pnpm openapi:export
 *
 * 前置：两个应用已启动（`pnpm docker:dev:up`，或分别
 * `pnpm start:admin:dev` / `PORT=3001 pnpm start:mall:dev`）。
 * 产物：`openapi/<app>.json` 与 `openapi/<app>.yaml`。
 */

interface Target {
  name: string;
  baseUrl: string;
}

interface ExportResult {
  name: string;
  ok: boolean;
  title?: string;
  paths?: number;
  schemas?: number;
  bytes?: number;
  yaml?: boolean;
  error?: string;
}

const DEFAULT_TARGETS: Target[] = [
  { name: 'admin', baseUrl: 'http://127.0.0.1:3000' },
  { name: 'mall', baseUrl: 'http://127.0.0.1:3001' },
];

const TIMEOUT_MS = 10_000;

function readFlag(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = args.indexOf(flag);
  if (index >= 0) return args[index + 1];
  return undefined;
}

function resolveTargets(): Target[] {
  const byFlag = {
    admin: readFlag('--admin'),
    mall: readFlag('--mall'),
  } as const;
  const byEnv = {
    admin: process.env.ADMIN_API_URL,
    mall: process.env.MALL_API_URL,
  } as const;

  return DEFAULT_TARGETS.map((target) => {
    const override = byFlag[target.name] ?? byEnv[target.name];
    return override ? { ...target, baseUrl: override } : target;
  });
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: 'application/json, text/yaml, */*' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function exportOne(target: Target, outDir: string): Promise<ExportResult> {
  const docsPath = readFlag('--docs-path') ?? 'api';
  let document: { openapi?: string; info?: { title?: string }; paths?: object };

  try {
    const raw = await fetchText(`${target.baseUrl}/${docsPath}-json`);
    document = JSON.parse(raw);
  } catch (error) {
    return {
      name: target.name,
      ok: false,
      error: `无法从 ${target.baseUrl}/${docsPath}-json 获取契约：${
        error instanceof Error ? error.message : String(error)
      }（应用未启动？或 Swagger 挂载路径不是 /${docsPath}）`,
    };
  }

  // 契约自检：缺这三个字段说明拿到的是错误页或被网关改写过的内容，落盘会误导前端。
  if (!document.openapi || !document.info?.title || !document.paths) {
    return {
      name: target.name,
      ok: false,
      error: `${target.baseUrl} 返回的不是合法 OpenAPI 文档（缺 openapi / info.title / paths）`,
    };
  }

  const json = `${JSON.stringify(document, null, 2)}\n`;
  writeFileSync(resolve(outDir, `${target.name}.json`), json, 'utf-8');

  // YAML 由 NestJS 自身渲染（/api-yaml），不引第三方序列化依赖，避免两处输出不一致。
  let yamlWritten = false;
  try {
    const yaml = await fetchText(`${target.baseUrl}/${docsPath}-yaml`);
    if (yaml.startsWith('openapi:')) {
      writeFileSync(resolve(outDir, `${target.name}.yaml`), yaml, 'utf-8');
      yamlWritten = true;
    }
  } catch {
    // YAML 是附加产物：失败不影响 JSON 导出，也不应让命令失败。
  }

  return {
    name: target.name,
    ok: true,
    title: document.info.title,
    paths: Object.keys(document.paths).length,
    schemas: Object.keys(
      (document as { components?: { schemas?: object } }).components?.schemas ?? {},
    ).length,
    bytes: Buffer.byteLength(json, 'utf-8'),
    yaml: yamlWritten,
  };
}

async function main(): Promise<void> {
  const outDir = resolve(process.cwd(), readFlag('--out') ?? 'openapi');
  mkdirSync(outDir, { recursive: true });

  const targets = resolveTargets();
  const results: ExportResult[] = [];
  for (const target of targets) {
    results.push(await exportOne(target, outDir));
  }

  for (const result of results) {
    if (result.ok) {
      process.stdout.write(
        `✓ ${result.name}: ${result.title} — ${result.paths} 个路径 / ${result.schemas} 个 schema` +
          ` → openapi/${result.name}.json${result.yaml ? ` + .yaml` : '（yaml 未取到）'}\n`,
      );
    } else {
      process.stderr.write(`✗ ${result.name}: ${result.error}\n`);
    }
  }

  // 任一应用失败即非零退出，便于 CI / 脚本串联时及时发现「文档其实是旧的」。
  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

void main();
