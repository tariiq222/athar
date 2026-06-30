import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListOccasionsDto } from './list-occasions.dto';

describe('ListOccasionsDto', () => {
  function validate(raw: Record<string, unknown>) {
    return validateSync(plainToInstance(ListOccasionsDto, raw));
  }

  function errorProps(raw: Record<string, unknown>): string[] {
    return validate(raw).map((e) => e.property).sort();
  }

  // ---- happy paths --------------------------------------------------------

  it('accepts valid from/to ISO dates without kind', () => {
    expect(validate({ from: '2026-09-01', to: '2026-09-30' })).toHaveLength(0);
  });

  it('accepts valid from/to with a known kind', () => {
    const kinds = [
      'national',
      'foundation',
      'ramadan',
      'eid_fitr',
      'eid_adha',
      'commercial',
    ];
    for (const kind of kinds) {
      expect(
        validate({ from: '2026-01-01', to: '2026-12-31', kind }),
      ).toHaveLength(0);
    }
  });

  it('accepts full datetime ISO strings (Terminus-style ISO8601)', () => {
    // @IsISO8601 accepts both date-only and datetime strings
    expect(
      validate({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T23:59:59.999Z' }),
    ).toHaveLength(0);
  });

  // ---- failure paths -------------------------------------------------------

  it('rejects when from is missing', () => {
    expect(errorProps({ to: '2026-09-30' })).toContain('from');
  });

  it('rejects when to is missing', () => {
    expect(errorProps({ from: '2026-09-01' })).toContain('to');
  });

  it('rejects both when from and to are missing', () => {
    const props = errorProps({});
    expect(props).toContain('from');
    expect(props).toContain('to');
  });

  it('rejects non-ISO from value', () => {
    expect(errorProps({ from: 'not-a-date', to: '2026-09-30' })).toContain('from');
  });

  it('rejects non-ISO to value', () => {
    expect(errorProps({ from: '2026-09-01', to: 'September 30' })).toContain('to');
  });

  it('rejects unknown kind value', () => {
    expect(
      errorProps({ from: '2026-01-01', to: '2026-12-31', kind: 'holiday' }),
    ).toContain('kind');
  });

  it('kind is optional — omitting it produces no error', () => {
    expect(errorProps({ from: '2026-01-01', to: '2026-12-31' })).toHaveLength(0);
  });

  it('rejects empty string as from value', () => {
    expect(errorProps({ from: '', to: '2026-09-30' })).toContain('from');
  });
});
