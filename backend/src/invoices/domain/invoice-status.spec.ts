import {
  INVOICE_STATUSES,
  PERSISTED_STATUSES,
  deriveEffectiveStatus,
  isIsoDate,
  statusFilterCriteria,
} from './invoice-status';

const TODAY = '2026-09-30';

describe('deriveEffectiveStatus', () => {
  it('due today is not overdue', () => {
    expect(deriveEffectiveStatus('Pending', TODAY, TODAY)).toBe('Pending');
    expect(deriveEffectiveStatus('Draft', TODAY, TODAY)).toBe('Draft');
  });

  it('due in the future is not overdue', () => {
    expect(deriveEffectiveStatus('Pending', '2026-10-01', TODAY)).toBe(
      'Pending',
    );
  });

  it('due yesterday is overdue for Pending and Draft', () => {
    expect(deriveEffectiveStatus('Pending', '2026-09-29', TODAY)).toBe(
      'Overdue',
    );
    expect(deriveEffectiveStatus('Draft', '2026-09-29', TODAY)).toBe('Overdue');
  });

  it('Paid is never overdue', () => {
    expect(deriveEffectiveStatus('Paid', '2020-01-01', TODAY)).toBe('Paid');
    expect(deriveEffectiveStatus('Paid', TODAY, TODAY)).toBe('Paid');
  });

  it('compares across month and year boundaries', () => {
    expect(deriveEffectiveStatus('Pending', '2026-08-31', '2026-09-01')).toBe(
      'Overdue',
    );
    expect(deriveEffectiveStatus('Pending', '2025-12-31', '2026-01-01')).toBe(
      'Overdue',
    );
    expect(deriveEffectiveStatus('Pending', '2026-01-01', '2025-12-31')).toBe(
      'Pending',
    );
  });

  it.each([
    '2026-9-30',
    '30/09/2026',
    '2026-02-30',
    '2026-13-01',
    '',
    '2026-09-30T00:00:00Z',
    ' 2026-09-30',
  ])('rejects invalid dueDate %j', (dueDate) => {
    expect(() => deriveEffectiveStatus('Pending', dueDate, TODAY)).toThrow(
      RangeError,
    );
  });

  it('rejects an invalid today', () => {
    expect(() => deriveEffectiveStatus('Pending', TODAY, '2026-9-30')).toThrow(
      RangeError,
    );
  });
});

describe('statusFilterCriteria', () => {
  it('Overdue: Draft or Pending with dueDate < today', () => {
    expect(statusFilterCriteria('Overdue', TODAY)).toEqual({
      persistedIn: ['Draft', 'Pending'],
      dueDate: { op: 'lt', value: TODAY },
    });
  });

  it('Draft: Draft with dueDate >= today', () => {
    expect(statusFilterCriteria('Draft', TODAY)).toEqual({
      persistedIn: ['Draft'],
      dueDate: { op: 'gte', value: TODAY },
    });
  });

  it('Pending: Pending with dueDate >= today', () => {
    expect(statusFilterCriteria('Pending', TODAY)).toEqual({
      persistedIn: ['Pending'],
      dueDate: { op: 'gte', value: TODAY },
    });
  });

  it('Paid: Paid with no date condition', () => {
    const criteria = statusFilterCriteria('Paid', TODAY);
    expect(criteria).toEqual({ persistedIn: ['Paid'] });
    expect(criteria.dueDate).toBeUndefined();
  });

  it('rejects an invalid today', () => {
    expect(() => statusFilterCriteria('Overdue', 'yesterday')).toThrow(
      RangeError,
    );
  });

  it('agrees with deriveEffectiveStatus for every status and due date', () => {
    const dueDates = ['2026-09-29', TODAY, '2026-10-01'];
    for (const filter of INVOICE_STATUSES) {
      const criteria = statusFilterCriteria(filter, TODAY);
      for (const persisted of PERSISTED_STATUSES) {
        for (const dueDate of dueDates) {
          const matches =
            criteria.persistedIn.includes(persisted) &&
            (!criteria.dueDate ||
              (criteria.dueDate.op === 'lt'
                ? dueDate < criteria.dueDate.value
                : dueDate >= criteria.dueDate.value));
          expect(matches).toBe(
            deriveEffectiveStatus(persisted, dueDate, TODAY) === filter,
          );
        }
      }
    }
  });
});

describe('isIsoDate', () => {
  it('accepts real dates including leap day', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
  });
});
