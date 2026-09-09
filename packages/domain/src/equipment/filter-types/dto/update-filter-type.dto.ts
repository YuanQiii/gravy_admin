import { PartialType } from '@nestjs/swagger';
import { CreateFilterTypeDto } from './create-filter-type.dto';

export class UpdateFilterTypeDto extends PartialType(CreateFilterTypeDto) {}
