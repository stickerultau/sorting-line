const UNITS = ['K', 'M', 'B', 'T', 'Q']

/** A whole number for the screen: every digit up to 999,999, then three figures and a unit (1.23M, 45.6B). */
export function compact(value: number): string {
  const whole = Math.round(value)
  if (Math.abs(whole) < 1_000_000) return whole.toLocaleString('en-US')
  let scaled = whole / 1000
  let unit = 0
  while (Math.abs(scaled) >= 1000 && unit < UNITS.length - 1) {
    scaled /= 1000
    unit++
  }
  // Cut, not rounded: 999,999,999 must not read as 1000M.
  const digits = Math.abs(scaled) < 10 ? 2 : Math.abs(scaled) < 100 ? 1 : 0
  const cut = Math.trunc(scaled * 10 ** digits) / 10 ** digits
  return cut.toFixed(digits) + UNITS[unit]
}
