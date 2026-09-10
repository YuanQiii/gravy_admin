import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CustomerJwtStrategy } from '@/core/strategies/customer-jwt.strategy';
import { OptionalCustomerGuard } from './optional-customer.guard';

const SECRET = 'test-secret';

function signToken(payload: object): string {
  const jwt = new JwtService({ secret: SECRET });
  return jwt.sign(payload, { expiresIn: '1h' });
}

function createContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('OptionalCustomerGuard', () => {
  let guard: OptionalCustomerGuard;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'customer-jwt' })],
      providers: [
        CustomerJwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key === 'jwt.secret' ? SECRET : undefined)),
          },
        },
        OptionalCustomerGuard,
      ],
    }).compile();
    guard = moduleRef.get<OptionalCustomerGuard>(OptionalCustomerGuard);
  });

  it('有效 customer token → 放行且注入 request.customer.customerId', async () => {
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

  it('user token（realm 非 customer）→ 按匿名放行，不注入身份', async () => {
    const request: any = {
      method: 'GET',
      headers: {
        authorization: `Bearer ${signToken({ sub: 'user-uuid-1', realm: 'user' })}`,
      },
    };
    const allowed = await guard.canActivate(createContext(request));
    expect(allowed).toBe(true);
    expect(request.customer).toBeUndefined();
  });

  it('无 Authorization 头 → 按匿名放行，不注入身份', async () => {
    const request: any = { method: 'GET', headers: {} };
    const allowed = await guard.canActivate(createContext(request));
    expect(allowed).toBe(true);
    expect(request.customer).toBeUndefined();
  });

  it('坏 token → 按匿名放行，不注入身份', async () => {
    const request: any = {
      method: 'GET',
      headers: { authorization: 'Bearer not-a-valid-token' },
    };
    const allowed = await guard.canActivate(createContext(request));
    expect(allowed).toBe(true);
    expect(request.customer).toBeUndefined();
  });
});