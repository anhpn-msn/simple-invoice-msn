import { ApiProperty } from '@nestjs/swagger';
import {
  PERMISSIONS,
  ROLES,
  type Permission,
  type Role,
} from '../../common/auth/permissions';
import { BEARER_SCHEME } from '../auth.constants';

/** The signed-in user (SPEC 6.1). Never includes the password hash or lockout state. */
export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'accountant@example.com' })
  email!: string;

  @ApiProperty({ example: 'Demo Accountant' })
  fullname!: string;

  @ApiProperty({ enum: ROLES, example: 'ACCOUNTANT' })
  role!: Role;

  @ApiProperty({
    enum: PERMISSIONS,
    isArray: true,
    example: ['invoice:read', 'invoice:create'],
  })
  permissions!: Permission[];
}

/** Body of a successful login or refresh (SPEC 6.1, 6.2). */
export class LoginResponseDto {
  @ApiProperty({ description: 'Access JWT. Keep it in memory only.' })
  accessToken!: string;

  @ApiProperty({ enum: [BEARER_SCHEME], example: BEARER_SCHEME })
  tokenType!: typeof BEARER_SCHEME;

  @ApiProperty({
    description: 'Access token lifetime in seconds.',
    example: 3600,
  })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
