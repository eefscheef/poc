export function isPrime(n) {
  if (n <= 1) return false;      // <-- mutation hotspot if changed to < 1
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}
