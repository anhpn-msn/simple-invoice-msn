import { ApiProperty } from '@nestjs/swagger';

/** Error body of every non-2xx response (SPEC section 6). */
export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    description:
      'A string, or an array of strings for validation errors (400).',
    example: 'Invoice not found',
  })
  message!: string | string[];

  @ApiProperty({ example: 'Not Found' })
  error!: string;
}
