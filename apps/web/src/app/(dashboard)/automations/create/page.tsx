"use client";

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { FlowCanvas } from '../components/flow/FlowCanvas';
import { Node, Edge } from '@xyflow/react';
import api from '@/lib/api';

function CreatePageInner() {
    const searchParams = useSearchParams();
    const ruleId = searchParams.get('ruleId');
    const openAI = searchParams.get('ai') === '1';
    const replayExecutionId = searchParams.get('replayExecutionId');

    const [initialNodes, setInitialNodes] = useState<Node[] | undefined>(undefined);
    const [initialEdges, setInitialEdges] = useState<Edge[] | undefined>(undefined);
    const [initialName, setInitialName] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(!!ruleId);

    useEffect(() => {
        if (!ruleId) return;

        api.get(`/automations/${ruleId}`)
            .then(res => {
                const rule = res.data;
                if (rule) {
                    const flowDef = rule.flowDefinition as any;
                    setInitialName(rule.name);
                    setInitialNodes(flowDef?.nodes || undefined);
                    setInitialEdges(flowDef?.edges || undefined);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [ruleId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-base">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <p className="text-sm text-muted">Loading flow...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen w-full !bg-base">
            <FlowCanvas
                initialNodes={initialNodes}
                initialEdges={initialEdges}
                initialName={initialName}
                initialRuleId={ruleId || undefined}
                openAI={openAI}
                replayExecutionId={replayExecutionId || undefined}
            />
        </div>
    );
}

export default function AutomationsCreatePage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen bg-base">
                <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
        }>
            <CreatePageInner />
        </Suspense>
    );
}
