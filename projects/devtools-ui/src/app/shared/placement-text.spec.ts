import { missText } from './placement-text';

// Synthetic rejections: a framework whose secondaries (`/testing`, `/http`) share their package's range.
const rejection = (
  member: string,
  specifier: string,
  requiredVersion: string,
  tag: string,
  strict = true,
) => ({
  member,
  specifier,
  requiredVersion,
  tag,
  strict,
});

describe('missText — range rejections', () => {
  it('names packages once and counts their entrypoints when there are more', () => {
    expect(
      missText({
        kind: 'range',
        rejections: [
          rejection('@nf-lab/fw-core', '@nf-lab/fw-core', '~3.1.0', '3.2.0'),
          rejection('@nf-lab/fw-core', '@nf-lab/fw-core/testing', '~3.1.0', '3.2.0'),
          rejection('@nf-lab/fw-http', '@nf-lab/fw-http', '~3.1.0', '3.2.0'),
        ],
      }),
    ).toBe(
      'its range ~3.1.0 (strict) rejects the global 3.2.0 of @nf-lab/fw-core, @nf-lab/fw-http (3 entrypoints)',
    );
  });

  it('keeps one clause per range and tag', () => {
    expect(
      missText({
        kind: 'range',
        rejections: [
          rejection('@nf-lab/fw-core', '@nf-lab/fw-core', '~3.1.0', '3.2.0'),
          rejection('@nf-lab/fw-forms', '@nf-lab/fw-forms', '^2.0.0', '3.0.0', false),
        ],
      }),
    ).toBe(
      'its range ~3.1.0 (strict) rejects the global 3.2.0 of @nf-lab/fw-core; ^2.0.0 (not strict) rejects the global 3.0.0 of @nf-lab/fw-forms',
    );
  });

  it('marks strictness per group when one range mixes both', () => {
    expect(
      missText(
        {
          kind: 'range',
          rejections: [
            rejection('@nf-lab/fw-core', '@nf-lab/fw-core', '^2.0.0', '3.0.0'),
            rejection('@nf-lab/fw-forms', '@nf-lab/fw-forms', '^2.0.0', '3.0.0', false),
          ],
        },
        'the serving build of host',
      ),
    ).toBe(
      'its range ^2.0.0 rejects the served 3.0.0 of @nf-lab/fw-core (strict) and @nf-lab/fw-forms (not strict)',
    );
  });
});
