import { canonicalJson } from './canonical-json';

describe('canonicalJson', () => {
  it('ignores key order at every level', () => {
    const a = { x: 1, y: { b: 2, a: [{ d: 1, c: 2 }] } };
    const b = { y: { a: [{ c: 2, d: 1 }], b: 2 }, x: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('drops undefined members but keeps null', () => {
    expect(canonicalJson({ a: undefined, b: null, c: 1 })).toBe(
      '{"b":null,"c":1}',
    );
  });

  it('keeps array order', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('distinguishes different values and string versus number', () => {
    expect(canonicalJson({ rate: '10' })).not.toBe(canonicalJson({ rate: 10 }));
    expect(canonicalJson({ rate: '10.00' })).not.toBe(
      canonicalJson({ rate: '10' }),
    );
  });

  it('works on class instances', () => {
    class Body {
      b = 1;
      a = 2;
      c?: string;
    }
    expect(canonicalJson(new Body())).toBe('{"a":2,"b":1}');
  });
});
