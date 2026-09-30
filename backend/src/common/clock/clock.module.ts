import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { BUSINESS_TIMEZONE, BusinessCalendar } from './business-calendar';
import { CLOCK, SystemClock } from './clock';

/** The validated env (default UTC) is the only source of the business time zone. */
export function businessTimezoneFactory(config: AppConfigService): string {
  return config.get('businessTimezone');
}

@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: BUSINESS_TIMEZONE,
      inject: [AppConfigService],
      useFactory: businessTimezoneFactory,
    },
    BusinessCalendar,
  ],
  exports: [CLOCK, BUSINESS_TIMEZONE, BusinessCalendar],
})
export class ClockModule {}
