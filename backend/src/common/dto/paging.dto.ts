import { ApiProperty } from '@nestjs/swagger';

export class PagingDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  pageSize!: number;

  @ApiProperty({ example: 41 })
  total!: number;
}
