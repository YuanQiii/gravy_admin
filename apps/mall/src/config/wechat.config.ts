import { registerAs } from '@nestjs/config';

export class WechatConfig {
  appId!: string;
  secret!: string;
}

export default registerAs(
  'wechat',
  (): WechatConfig => ({
    appId: process.env.WECHAT_APPID || '',
    secret: process.env.WECHAT_SECRET || '',
  }),
);