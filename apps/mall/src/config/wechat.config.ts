import { registerAs } from '@nestjs/config';

export class WechatConfig {
  appId!: string;
  secret!: string;
  endpoint!: string;
}

export default registerAs(
  'wechat',
  (): WechatConfig => ({
    appId: process.env.WECHAT_APPID || '',
    secret: process.env.WECHAT_SECRET || '',
    // 测试/本地可覆盖换取端点（默认打到微信官方地址）
    endpoint: process.env.WECHAT_API_ENDPOINT || '',
  }),
);