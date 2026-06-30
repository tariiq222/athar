import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { IsTrue } from '../../common/validators/is-true.validator';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  tenantName!: string;

  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;

  // Sprint A — Task 4.1: PDPL consent. acceptTerms must be `true` (literal),
  // not just truthy. termsVersion pins which version of the privacy policy
  // / terms the user agreed to so we can re-prompt when the policy changes.
  @IsTrue({ message: 'يجب الموافقة على الشروط' })
  acceptTerms!: boolean;

  @IsNotEmpty()
  @IsString()
  termsVersion!: string;
}