import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessGuard } from './access.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GuestWriteGuard } from './guest-write.guard';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';

const createContext = (): ExecutionContext =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => ({
        method: 'GET',
        headers: {},
        user: undefined,
      })),
    })),
  }) as unknown as ExecutionContext;

const createReflector = ({
  isPublic = false,
}: { isPublic?: boolean } = {}): Reflector =>
  ({
    getAllAndOverride: jest.fn(() => isPublic),
  }) as unknown as Reflector;

const createStubGuard = (
  name: string,
  behavior: 'ok' | 'false' | 'throw' = 'ok',
): { instance: any; spy: jest.Mock } => {
  const spy = jest.fn(async () => {
    if (behavior === 'false') return false;
    if (behavior === 'throw') throw new Error(`${name} failed`);
    return true;
  });
  return { instance: { canActivate: spy } as unknown as any, spy };
};

describe('AccessGuard', () => {
  it('on public route: invokes JwtAuthGuard only, swallows failure, returns true', async () => {
    const jwt = createStubGuard('Jwt', 'throw'); // JwtAuthGuard throws "no token"
    const guest = createStubGuard('GuestWrite');
    const roles = createStubGuard('Roles');
    const perms = createStubGuard('Permissions');

    const guard = new AccessGuard(
      createReflector({ isPublic: true }),
      jwt.instance as JwtAuthGuard,
      guest.instance as GuestWriteGuard,
      roles.instance as RolesGuard,
      perms.instance as PermissionsGuard,
    );

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(jwt.spy).toHaveBeenCalled();
    expect(guest.spy).not.toHaveBeenCalled();
    expect(roles.spy).not.toHaveBeenCalled();
    expect(perms.spy).not.toHaveBeenCalled();
  });

  it('on public route: JwtAuthGuard success populates request.user and returns true', async () => {
    const jwt = createStubGuard('Jwt', 'ok');
    const guest = createStubGuard('GuestWrite');
    const roles = createStubGuard('Roles');
    const perms = createStubGuard('Permissions');

    const guard = new AccessGuard(
      createReflector({ isPublic: true }),
      jwt.instance as JwtAuthGuard,
      guest.instance as GuestWriteGuard,
      roles.instance as RolesGuard,
      perms.instance as PermissionsGuard,
    );

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(jwt.spy).toHaveBeenCalled();
    expect(guest.spy).not.toHaveBeenCalled();
    expect(roles.spy).not.toHaveBeenCalled();
    expect(perms.spy).not.toHaveBeenCalled();
  });

  it('calls all 4 guards in order: Jwt → GuestWrite → Roles → Permissions when not public', async () => {
    const callOrder: string[] = [];
    const track = (name: string) => {
      const spy = jest.fn(async () => {
        callOrder.push(name);
        return true;
      });
      return { instance: { canActivate: spy } as unknown as any, spy };
    };
    const jwt = track('Jwt');
    const guest = track('GuestWrite');
    const roles = track('Roles');
    const perms = track('Permissions');

    const guard = new AccessGuard(
      createReflector({ isPublic: false }),
      jwt.instance as JwtAuthGuard,
      guest.instance as GuestWriteGuard,
      roles.instance as RolesGuard,
      perms.instance as PermissionsGuard,
    );

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(callOrder).toEqual(['Jwt', 'GuestWrite', 'Roles', 'Permissions']);
  });

  it('stops the chain when an orchestrated guard returns false', async () => {
    const jwt = createStubGuard('Jwt', 'ok');
    const guest = createStubGuard('GuestWrite', 'false');
    const roles = createStubGuard('Roles', 'ok');
    const perms = createStubGuard('Permissions', 'ok');

    const guard = new AccessGuard(
      createReflector({ isPublic: false }),
      jwt.instance as JwtAuthGuard,
      guest.instance as GuestWriteGuard,
      roles.instance as RolesGuard,
      perms.instance as PermissionsGuard,
    );

    await expect(guard.canActivate(createContext())).resolves.toBe(false);
    expect(jwt.spy).toHaveBeenCalled();
    expect(guest.spy).toHaveBeenCalled();
    expect(roles.spy).not.toHaveBeenCalled();
    expect(perms.spy).not.toHaveBeenCalled();
  });
});
