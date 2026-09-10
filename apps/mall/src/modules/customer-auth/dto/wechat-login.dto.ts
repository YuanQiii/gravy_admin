import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * 微信小程序静默登录 DTO。
 *
 * 携带 `wx.login` 获取的 `js_code`，后端以 appid/secret 换取 `openid` 定位/创建客户。
 */
export class WechatLoginDto {
  @ApiProperty({
    description: '微信小程序 wx.login 获取的一次性 js_code（code）',
    example: '0b1Zb...',
  })
  @IsString({ message: 'code 必须是字符串' })
  @IsNotEmpty({ message: 'code 不能为空' })
  code: string;
}