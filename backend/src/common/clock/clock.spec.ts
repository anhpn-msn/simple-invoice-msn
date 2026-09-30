import { Test } from '@nestjs/testing';
import { BUSINESS_TIMEZONE, BusinessCalendar } from './business-calendar';
import { CLOCK, FixedClock, SystemClock } from './clock';
import { ClockModule, businessTimezoneFactory } from './clock.module';
import { AppConfigService } from '../../config/app-config.service';

describe('FixedClock', () => {
  it('returns the configured instant and can be moved', () => {
    const clock = new FixedClock('2026-09-30T16:30:00Z');
    expect(clock.now().toISOString()).toBe('2026-09-30T16:30:00.000Z');
    clock.set(new Date('2026-10-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('does not let callers mutate the stored instant', () => {
    const clock = new FixedClock('2026-09-30T16:30:00Z');
    clock.now().setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-09-30T16:30:00.000Z');
  });
});

describe('SystemClock', () => {
  it('returns a time close to the real now', () => {
    const before = Date.now();
    const value = new SystemClock().now().getTime();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });
});

describe('BusinessCalendar', () => {
  const instant = '2026-09-30T16:30:00Z';

  it.each([
    ['UTC', '2026-09-30'],
    ['Asia/Singapore', '2026-10-01'],
    ['America/New_York', '2026-09-30'],
  ])('today() in %s is %s', (zone, expected) => {
    expect(new BusinessCalendar(new FixedClock(instant), zone).today()).toBe(
      expected,
    );
  });

  it('follows the clock', () => {
    const clock = new FixedClock(instant);
    const calendar = new BusinessCalendar(clock, 'Asia/Singapore');
    clock.set('2026-10-01T16:00:00Z');
    expect(calendar.today()).toBe('2026-10-02');
  });

  it('fails fast on an invalid time zone', () => {
    expect(
      () => new BusinessCalendar(new FixedClock(instant), 'Nope/Zone'),
    ).toThrow(RangeError);
  });
});

describe('ClockModule', () => {
  const configWith = (businessTimezone: string) =>
    ({ get: () => businessTimezone }) as unknown as AppConfigService;

  it('reads the business time zone from the validated config', () => {
    expect(businessTimezoneFactory(configWith('Asia/Singapore'))).toBe(
      'Asia/Singapore',
    );
  });

  it('wires CLOCK, BUSINESS_TIMEZONE and BusinessCalendar', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        {
          module: class ConfigStubModule {},
          global: true,
          providers: [
            {
              provide: AppConfigService,
              useValue: configWith('Asia/Singapore'),
            },
          ],
          exports: [AppConfigService],
        },
        ClockModule,
      ],
    })
      .overrideProvider(CLOCK)
      .useValue(new FixedClock('2026-09-30T16:30:00Z'))
      .compile();
    expect(moduleRef.get(BUSINESS_TIMEZONE)).toBe('Asia/Singapore');
    expect(moduleRef.get(BusinessCalendar).today()).toBe('2026-10-01');
    expect(new SystemClock()).toBeInstanceOf(SystemClock);
  });
});
