/**
 * Formats a number as Indian Rupees using the en-IN locale.
 * Example: formatINR(84200) → "₹84,200.00"
 */
export function formatINR(amount: number | undefined | null): string {
  if (amount == null || isNaN(amount)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Compact formatter for large INR amounts (KPI cards etc.)
 * Example: formatINRCompact(84200) → "₹84.2k"
 */
export function formatINRCompact(amount: number | undefined | null): string {
  if (amount == null || isNaN(amount)) return '₹0';
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(1)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}k`;
  return `₹${amount.toFixed(0)}`;
}
