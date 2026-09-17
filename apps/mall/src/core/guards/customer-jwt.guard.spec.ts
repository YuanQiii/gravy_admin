import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CustomerJwtStrategy } from '@/core/strategies/customer-jwt.strategy';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CustomerAvailabilityModule } from '../customer-availability/customer-availability.module';
import { AVAILABILITY_GATE } from '../customer-availability/customer-availability.policy';

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
  let availabilityGate: { assertWithinTtl: jest.Mock };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'customer-jwt' }),
        CustomerAvailabilityModule,
      ],
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
    // 守卫只依赖 AvailabilityGate 接口（T8 seam）：把 no-op gate 换成可断言的
    // spy —— 测试与实现都不绑定具体类。
    availabilityGate = { assertWithinTtl: jest.fn() };
    const gate = moduleRef.get<any>(AVAILABILITY_GATE as any);
    jest
      .spyOn(gate, 'assertWithinTtl')
      .mockImplementation(availabilityGate.assertWithinTtl);
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
    // 守卫经过 AvailabilityGate seam（T8）：no-op 放行，但调用点存在且带 customerId
    expect(availabilityGate.assertWithinTtl).toHaveBeenCalledWith(
      'customer-uuid-1',
    );
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