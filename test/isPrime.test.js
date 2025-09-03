import { isPrime } from '../src/isPrime.js';

describe('isPrime', () => {
  test('small primes', () => {
    expect(isPrime(2)).toBe(true);
    expect(isPrime(3)).toBe(true);
    expect(isPrime(17)).toBe(true);
  });

  test('non-primes', () => {
    expect(isPrime(4)).toBe(false);
    expect(isPrime(9)).toBe(false);
    expect(isPrime(100)).toBe(false);
  });

  // Intentional gap: no explicit test for n = 1 (or <= 1)
  // This lets certain mutants survive for demonstration.
});
