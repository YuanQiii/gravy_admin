import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** `jscode2session` 微信换取结果（当前仅消费 openid） */
export interface WechatSessionResult {
  openid: string;
}

/**
 * 微信小程序 `code -> openid` 换取客户端（mall 自有 deep-seam）。
 *
 * - 使用 Node 内置 `fetch`（零依赖）调 `https://api.weixin.qq.com/sns/jscode2session`。
 * - 仅消费 `openid`；`session_key` 不落库、不依赖。
 * - 换取失败（`errcode != 0`）或未返回 `openid` → 统一 `UnauthorizedException`，
 *   话术不泄露微信内部 errcode/errmsg。
 */
@Injectable()
export class WechatCode2SessionClient {
  private readonly logger = new Logger(WechatCode2SessionClient.name);
  private readonly defaultEndpoint =
    'https://api.weixin.qq.com/sns/jscode2session';
  private readonly timeoutMs = 5000;

  constructor(private readonly configService: ConfigService) {}

  async code2Session(code: string): Promise<WechatSessionResult> {
    const appId = this.configService.get<string>('wechat.appId') || '';
    const secret = this.configService.get<string>('wechat.secret') || '';
    const endpoint =
      this.configService.get<string>('wechat.endpoint') || this.defaultEndpoint;

    const params = new URLSearchParams({
      appid: appId,
      secret,
      js_code: code,
      grant_type: 'authorization_code',
    });

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${endpoint}?${params.toString()}`,
      );
    } catch (error) {
      this.logger.warn(`Wechat code2session request failed: ${error}`);
      throw new UnauthorizedException('微信登录凭证无效');
    }

    if (!response.ok) {
      this.logger.warn(
        `Wechat code2session HTTP ${response.status}`,
      );
      throw new UnauthorizedException('微信登录凭证无效');
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch (error) {
      this.logger.warn(`Wechat code2session bad JSON: ${error}`);
      throw new UnauthorizedException('微信登录凭证无效');
    }

    const errcode = payload.errcode;
    const openid = payload.openid;
    if (
      typeof errcode === 'number' &&
      errcode !== 0
    ) {
      this.logger.warn(`Wechat code2session errcode=${errcode}`);
      throw new UnauthorizedException('微信登录凭证无效');
    }
    if (typeof openid !== 'string' || openid.length === 0) {
      this.logger.warn('Wechat code2session missing openid');
      throw new UnauthorizedException('微信登录凭证无效');
    }

    return { openid };
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}