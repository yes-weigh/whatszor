/**
 * phone.utils.ts — E.164 phone normalization (India +91 scope)
 *
 * All leads from Google Places have their phone numbers normalized here
 * before being stored. Only Indian (+91) numbers are supported in Phase 1.
 *
 * Handles:
 *   "9876543210"      → "+919876543210"
 *   "09876543210"     → "+919876543210"
 *   "+91 98765 43210" → "+919876543210"
 *   "91 9876543210"   → "+919876543210"
 *   "+919876543210"   → "+919876543210"  (passthrough)
 *
 * Returns null for numbers that cannot be confidently parsed.
 * The lead is still stored — hasPhone is set false.
 *
 * Future: add countryCode param (default '91') for multi-country support.
 */

export function normalizeToE164(raw: string | null | undefined): string | null {
    if (!raw?.trim()) return null;

    // Strip all non-digit characters
    const digits = raw.replace(/\D/g, '');

    // Already 12 digits starting with 91 (e.g. "919876543210")
    if (digits.length === 12 && digits.startsWith('91')) {
        return `+${digits}`;
    }

    // 10-digit Indian mobile number
    if (digits.length === 10) {
        return `+91${digits}`;
    }

    // 11-digit with leading 0 (e.g. "09876543210")
    if (digits.length === 11 && digits.startsWith('0')) {
        return `+91${digits.slice(1)}`;
    }

    return null; // Cannot safely determine country code
}
