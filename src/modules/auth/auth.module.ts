import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '@/modules/system/users/users.module';
import { LoginLogsModule } from '@/modules/system/login-logs/login-logs.module';
import { JwtStrategy } from '@/core/strategies/jwt.strategy';
import { JwtAuthGuard } from '@/core/guards/jwt-auth.guard';
import { GuestWriteGuard } from '@/core/guards/guest-write.guard';
import { RolesGuard } from '@/core/guards/roles.guard';
import { PermissionsGuard } from '@/core/guards/permissions.guard';
import { AccessGuard } from '@/core/guards/access.guard';
import { CustomerJwtGuard } from '@/core/guards/customer-jwt.guard';
import { CustomerJwtStrategy } from '@/core/strategies/customer-jwt.strategy';
import { SessionStore } from '@/core/session/session-store.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    UsersModule,
    LoginLogsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret') || 'default-secret-key',
        signOptions: {
          expiresIn: (configService.get<string>('jwt.accessTokenExpiresIn') ||
            '2h') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionStore,
    JwtStrategy,
    JwtAuthGuard,
    GuestWriteGuard,
    RolesGuard,
    PermissionsGuard,
    AccessGuard,
    CustomerJwtStrategy,
    CustomerJwtGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    SessionStore,
    JwtModule, // 复用同一 JWT secret（D7），供客户域注入全局 JwtService
    JwtStrategy,
    JwtAuthGuard,
    GuestWriteGuard,
    RolesGuard,
    PermissionsGuard,
    AccessGuard,
    CustomerJwtStrategy,
    CustomerJwtGuard,
  ],
})
export class AuthModule {}
