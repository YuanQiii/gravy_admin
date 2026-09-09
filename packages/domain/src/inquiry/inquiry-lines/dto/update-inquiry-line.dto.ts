import { PartialType } from '@nestjs/swagger';
import { CreateInquiryLineDto } from './create-inquiry-line.dto';

export class UpdateInquiryLineDto extends PartialType(CreateInquiryLineDto) {}
