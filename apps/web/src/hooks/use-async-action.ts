import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

interface UseAsyncActionOptions<T> {
    onSuccess?: (data: T) => void;
    onError?: (error: any) => void;
    successMessage?: string;
    errorMessage?: string;     // Fallback if no specific API message
    throwError?: boolean;      // Whether to let error bubble up instead of catching
}

export function useAsyncAction<T = any>() {
    const [isLoading, setIsLoading] = useState(false);

    const execute = useCallback(async (
        actionFn: () => Promise<T>,
        options?: UseAsyncActionOptions<T>
    ): Promise<T | undefined> => {
        setIsLoading(true);
        try {
            const result = await actionFn();
            if (options?.successMessage) {
                toast.success(options.successMessage);
            }
            if (options?.onSuccess) {
                options.onSuccess(result);
            }
            return result;
        } catch (error: any) {
            const serverMsg = error?.response?.data?.message || error?.message;
            const errMsg = serverMsg || options?.errorMessage || 'An error occurred';
            toast.error(errMsg);
            
            if (options?.onError) {
                options.onError(error);
            }
            
            if (options?.throwError) {
                throw error;
            }
            return undefined;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { isLoading, execute };
}
