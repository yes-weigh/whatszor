/**
 * Pure helper functions used by the automation engine.
 * No external imports — fully unit-testable.
 */

/** Interpolates {{contact.firstName}}-style variables from a context object. */
export function parseVariables(text: string, context: Record<string, any>): string {
    if (!text) return text;
    return text.replace(/{{([^}]+)}}/g, (_match, path) => {
        const keys = path.trim().split('.');
        let val: any = context;
        for (const k of keys) {
            val = val?.[k];
            if (val === undefined) break;
        }
        return val !== undefined ? String(val) : _match;
    });
}

/** Evaluates a condition array with AND/OR logic. Returns true when conditions pass. */
export function evaluateConditions(
    conditions: any[],
    context: Record<string, any>,
    logic: 'AND' | 'OR' = 'AND',
): boolean {
    if (!conditions || conditions.length === 0) return true;

    const results = conditions.map(cond => {
        if (cond.type !== 'expression') return true;

        const keys = (cond.field || '').split('.');
        let val: any = context;
        for (const k of keys) {
            val = val?.[k];
            if (val === undefined) break;
        }
        const contextVal = String(val ?? '');
        const targetVal = String(cond.value ?? '');

        switch (cond.operator) {
            case 'eq': return contextVal === targetVal;
            case 'neq': return contextVal !== targetVal;
            case 'contains': return contextVal.includes(targetVal);
            case 'not_contains': return !contextVal.includes(targetVal);
            case 'starts_with': return contextVal.startsWith(targetVal);
            case 'ends_with': return contextVal.endsWith(targetVal);
            case 'gt': return parseFloat(contextVal) > parseFloat(targetVal);
            case 'lt': return parseFloat(contextVal) < parseFloat(targetVal);
            case 'is_set': return val !== undefined && val !== null && val !== '';
            case 'is_not_set': return val === undefined || val === null || val === '';
            default: return contextVal === targetVal;
        }
    });

    return logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}
