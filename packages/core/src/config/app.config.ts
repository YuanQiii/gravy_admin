import { registerAs } from '@nestjs/config';
import { resolveTrustProxy } from '../core/client-ip.resolver';

export class AppConfig {
  port!: number;
  nodeEnv!: string;
  tzSuffix!: string;
  oLogEnabled!: boolean;
  oLogMaskFields!: string;
  logLevel!: string;
  logRedact!: string;
  logSlowMs!: number;
  logRequestIdHeader!: string;
  trustedProxy!: boolean | number | string;
}

export default registerAs(
  'app',
  (): AppConfig => ({
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    tzSuffix: process.env.APP_TZ_SUFFIX || '+08:00',
    oLogEnabled: process.env.OPLOG_ENABLED !== 'false',
    oLogMaskFields:
      process.env.OPLOG_MASK_FIELDS ||
      'password,oldPassword,newPassword,token,authorization,secret,captcha',
    logLevel: process.env.LOG_LEVEL || 'info',
    logRedact: process.env.LOG_REDACT || '',
    logSlowMs: parseInt(process.env.LOG_SLOW_MS || '1000', 10),
    logRequestIdHeader: process.env.LOG_REQ_ID_HEADER || 'x-request-id',
    // 可信代理拓扑声明（harden-client-ip-trust-boundary）：默认 false = 不信任任何代理头
    trustedProxy: resolveTrustProxy(process.env.SECURITY_TRUSTED_PROXY),
  }),
);
