import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { Public } from '../common/decorators/public.decorator';
import { DRIZZLE } from '../database/database.module';
import type { Database } from '../database/database.types';
import { HEALTH_ROUTE } from './health.constants';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'up' })
  db!: string;
}

@ApiTags('health')
@Controller(HEALTH_ROUTE)
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Liveness and database readiness probe' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: 'The database is unreachable.',
  })
  async check(): Promise<HealthResponseDto> {
    try {
      await this.db.execute(sql`select 1`);
    } catch (error) {
      this.logger.error(
        `Database health check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok', db: 'up' };
  }
}
