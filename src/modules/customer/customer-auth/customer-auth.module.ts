import { Module } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerTokenService } from './customer-token.service';

@Module({
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerTokenService],
  exports: [CustomerAuthService, CustomerTokenService],
})
export class CustomerAuthModule {}