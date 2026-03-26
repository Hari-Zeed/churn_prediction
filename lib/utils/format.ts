/**
 * Central utility for standardizing number presentation across the dashboard.
 * Ensures metrics display exactly `decimals` places, handling edge cases gracefully.
 * 
 * @param value The raw number to format
 * @param decimals The number of decimal places to preserve (default 2)
 * @returns A string representing the formatted number, or '0' if invalid
 */
export function formatNumber(value: number | undefined | null | string, decimals: number = 2): string {
    if (value === undefined || value === null) return (0).toFixed(decimals);
    
    // Parse if we receive a string somehow, though TS should prevent most
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(num)) return (0).toFixed(decimals);
    
    // Check if it's already an integer and user doesn't strictly need decimals
    // Although the request asks to ensure they display exactly 2 decimal places: "Format percentages like: 91.22%."
    // So we use toFixed to guarantee the decimal places.
    return num.toFixed(decimals);
}
