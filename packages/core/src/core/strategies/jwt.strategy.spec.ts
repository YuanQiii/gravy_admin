import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { JwtPayload } from '../types/jwt-payload.type';
import { UserStatus } from '../../shared/constants/user-status.constant';
import { AUTH_REALM_CUSTOMER, AUTH_REALM_USER } from '../constants/auth-realm.constant';

const createStrategy = (): JwtStrategy =>
  new JwtStrategy({
    get: (key: string) => (key === 'jwt.secret' ? 'test-secret' : undefined),
  } as unknown as ConfigService);

const basePayload = (): Partial<JwtPayload> => ({
  sub: 'user-1',
  username: 'admin',
  nickname: 'Admin',
  status: UserStatus.ENABLED,
  roleKeys: ['admin'],
  iat: 0,
  exp: 9999999999,
});

describe('JwtStrategy', () => {
  it('accepts a token whose realm is user', async () => {
    const strategy = createStrategy();
    const result = await strategy.validate({
      ...basePayload(),
      realm: AUTH_REALM_USER,
    } as JwtPayload);
    expect(result.userId).toBe('user-1');
  });

  it('rejects a customer-realm token (401)', async () => {
    const strategy = createStrategy();
    await expect(
      strategy.validate({
        ...basePayload(),
        realm: AUTH_REALM_CUSTOMER,
      } as JwtPayload),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token with no realm declaration (401)', async () => {
    const strategy = createStrategy();
    await expect(
      strategy.validate(basePayload() as JwtPayload),
    ).rejects.toThrow(UnauthorizedException);
  });
});
