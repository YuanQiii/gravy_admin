import { Module } from '@nestjs/common';
import { BrandsService } from './brands.service';
import {
  PrismaModule,
  PrismaService,
  SoftDeleteService,
} from '@gvray/core';
import { ConfigService } from '@nestjs/config';
import {
  HotBrandCandidateSource,
  SqlHotBrandCandidateSource,
} from './hot-candidate-source';

/** 候选源 DI token：按接口注入，使单测可替换 Memory 实现。 */
export const BRAND_HOT_CANDIDATE_SOURCE = Symbol('BRAND_HOT_CANDIDATE_SOURCE');

@Module({
  imports: [PrismaModule],
  providers: [
    SqlHotBrandCandidateSource,
    {
      provide: BRAND_HOT_CANDIDATE_SOURCE,
      useClass: SqlHotBrandCandidateSource,
    },
    {
      provide: BrandsService,
      inject: [PrismaService, ConfigService, SoftDeleteService, BRAND_HOT_CANDIDATE_SOURCE],
      useFactory: (
        prisma: PrismaService,
        configService: ConfigService,
        softDelete: SoftDeleteService,
        source: HotBrandCandidateSource,
      ) => new BrandsService(prisma, configService, softDelete, source),
    },
  ],
  exports: [BrandsService],
})
export class BrandsModule {}
