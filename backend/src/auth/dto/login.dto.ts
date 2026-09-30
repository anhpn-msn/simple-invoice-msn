import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';
import { EMAIL_MAX_LENGTH } from '../../database/database.constants';
import { MAX_PASSWORD_BYTES } from '../../config/config.constants';
import { normalizeEmail } from '../normalize-email';

function MaxUtf8Bytes(
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxUtf8Bytes',
      constraints: [max],
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max,
        defaultMessage: () => `password must be at most ${max} bytes`,
      },
    },
    options,
  );
}

export class LoginDto {
  @ApiProperty({
    example: 'accountant@example.com',
    maxLength: EMAIL_MAX_LENGTH,
    description: 'Trimmed and lowercased before lookup.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({
    format: 'password',
    description: `At most ${MAX_PASSWORD_BYTES} bytes (UTF-8).`,
  })
  @IsString()
  @IsNotEmpty()
  @MaxUtf8Bytes(MAX_PASSWORD_BYTES)
  password!: string;
}
