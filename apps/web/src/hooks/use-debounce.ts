import { useState, useEffect } from 'react';

/**
 * Debounce a rapidly-changing value.
 * Returns the debounced value after `delay` ms of no updates.
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}
