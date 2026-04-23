'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leadGenerationApi } from '@/lib/leadGeneration.api';
import { toast } from 'react-hot-toast';
import { useState, useEffect } from 'react';

export function useOptimizer() {
    const queryClient = useQueryClient();
    const [activePlanBatchId, setActivePlanBatchId] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(false);

    const planMutation = useMutation({
        mutationFn: (params: { city: string; cityLat?: number; cityLng?: number; keywords: string[]; maxBudget: number }) =>
            leadGenerationApi.planOptimizerCampaign(params),
        onSuccess: (data) => {
            toast.success(`Plan generated with ${data.queriesCount} queries.`);
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to generate plan');
        }
    });

    const executeMutation = useMutation({
        mutationFn: ({ planBatchId, selectedPlanIds }: { planBatchId: string, selectedPlanIds: string[] }) =>
            leadGenerationApi.executeOptimizerCampaign(planBatchId, selectedPlanIds),
        onSuccess: (data, variables) => {
            toast.success(data.message || 'Execution started!');
            setActivePlanBatchId(variables.planBatchId);
            setIsPolling(true);
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to start execution');
        }
    });

    const { data: plansData, refetch: refetchPlans } = useQuery({
        queryKey: ['optimizerPlans', activePlanBatchId],
        queryFn: () => leadGenerationApi.getOptimizerPlans(activePlanBatchId!),
        enabled: !!activePlanBatchId,
        refetchInterval: isPolling ? 3000 : false,
    });

    // Stop polling if all plans are DONE, KILLED, or SKIPPED
    useEffect(() => {
        if (isPolling && plansData?.plans) {
            const allComplete = plansData.plans.every((p: any) => 
                ['DONE', 'KILLED', 'SKIPPED'].includes(p.status)
            );
            if (allComplete) {
                setIsPolling(false);
                toast.success('Optimizer campaign completed!');
                queryClient.invalidateQueries({ queryKey: ['leadLists'] });
            }
        }
    }, [plansData, isPolling, queryClient]);

    return {
        generatePlan: planMutation.mutateAsync,
        isGeneratingPlan: planMutation.isPending,
        planResult: planMutation.data,
        
        executeCampaign: executeMutation.mutateAsync,
        isExecuting: executeMutation.isPending,
        
        plans: plansData?.plans || [],
        isPolling,
        setActivePlanBatchId,
    };
}
