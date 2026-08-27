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
    JwtStrategy,
    JwtAuthGuard,
    GuestWriteGuard,
    RolesGuard,
    PermissionsGuard,
    AccessGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    JwtStrategy,
    JwtAuthGuard,
    GuestWriteGuard,
    RolesGuard,
    PermissionsGuard,
    AccessGuard,
  ],
})
export class AuthModule {}
