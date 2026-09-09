import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CustomerJwtStrategy } from '@/core/strategies/customer-jwt.strategy';
import { CustomerJwtGuard } from './customer-jwt.guard';

const SECRET = 'test-secret';

function signToken(payload: object): string {
  const jwt = new JwtService({ secret: SECRET });
  return jwt.sign(payload, { expiresIn: '1h' });
}

function createContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}), // passport 守卫会读取 res，失败路径改为抛异常
    }),
  } as unknown as ExecutionContext;
}

describe('CustomerJwtGuard (integration)', () => {
  let guard: CustomerJwtGuard;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'customer-jwt' })],
      providers: [
        CustomerJwtStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === 'jwt.secret' ? SECRET : undefined)) },
        },
        CustomerJwtGuard,
      ],
    }).compile();
    guard = moduleRef.get<CustomerJwtGuard>(CustomerJwtGuard);
  });

  it('customer token 放行并把 request.customer.customerId 注入', async () => {
    const request: any = {
      method: 'GET',
      headers: {
        authorization: `Bearer ${signToken({ sub: 'customer-uuid-1', realm: 'customer', jti: 'j1' })}`,
      },
    };
    const allowed = await guard.canActivate(createContext(request));
    expect(allowed).toBe(true);
    expect(request.customer.customerId).toBe('customer-uuid-1');
  });

  it('user token（realm 非 customer）拒绝，抛 401', async () => {
    const request: any = {
      method: 'GET',
      headers: {
        authorization: `Bearer ${signToken({ sub: 'user-uuid-1', realm: 'user' })}`,
      },
    };
    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('缺失 Authorization 头拒绝，抛 401', async () => {
    const request: any = { method: 'GET', headers: {} };
    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});