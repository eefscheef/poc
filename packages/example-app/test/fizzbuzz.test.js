import { fizzbuzz } from '../src/fizzbuzz.js';

describe('fizzbuzz', () => {
  test('numbers not divisible by 3 or 5 return the number', () => {
    expect(fizzbuzz(1)).toBe('1');
    expect(fizzbuzz(2)).toBe('2');
  });

  test('divisible by 3', () => {
    expect(fizzbuzz(3)).toBe('fizz');
    expect(fizzbuzz(6)).toBe('fizz');
  });

  test('divisible by 5', () => {
    expect(fizzbuzz(5)).toBe('buzz');
    expect(fizzbuzz(10)).toBe('buzz');
  });

  test('divisible by 15', () => {
    expect(fizzbuzz(15)).toBe('fizzbuzz');
    expect(fizzbuzz(30)).toBe('fizzbuzz');
  });
});
