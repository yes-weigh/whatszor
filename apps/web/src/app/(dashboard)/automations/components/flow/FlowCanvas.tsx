"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    ReactFlowProvider,
    useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TriggerNode, ActionNode, ConditionNode, DelayNode, AINode, IntegrationNode, HandoffNode } from './CustomNodes';
import { NodePropertiesPanel } from './NodePropertiesPanel';
import { ExecutionLogsPanel } from './ExecutionLogsPanel';
import { AIFlowGenerator } from '../AIFlowGenerator';
import { Sidebar } from './Sidebar';
import { Save, AlertCircle, Loader2, Play, Activity, Sparkles, Clock, X } from 'lucide-react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

const nodeTypes = {
    trigger: TriggerNode,
    action: ActionNode,
    condition: ConditionNode,
    delay: DelayNode,
    ai: AINode,
    integration: IntegrationNode,
    handoff: HandoffNode
};

const initialNodes: Node[] = [
    {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 100 },
        data: { triggerType: 'CONTACT_CREATED', label: 'When contact is created' },
        deletable: false,
    }
];

const initialEdges: Edge[] = [];

let id = 1;
const getId = () => `node_${id++}`;

interface FlowCanvasProps {
    initialNodes?: Node[];
    initialEdges?: Edge[];
    initialName?: string;
    initialRuleId?: string;
    openAI?: boolean;
    replayExecutionId?: string;
}

function FlowCanvasInner({ initialNodes: propsNodes, initialEdges: propsEdges, initialName, initialRuleId, openAI, ...props }: FlowCanvasProps) {
    const router = useRouter();
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { screenToFlowPosition } = useReactFlow();
    const [nodes, setNodes, onNodesChange] = useNodesState(propsNodes || initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(propsEdges || initialEdges);
    
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [ruleName, setRuleName] = useState(initialName || 'Untitled Rule');
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [savedRuleId, setSavedRuleId] = useState<string | null>(initialRuleId || null);
    const [showLogs, setShowLogs] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [showAIGenerator, setShowAIGenerator] = useState(openAI || false);
    const [replayExecutionId, setReplayExecutionId] = useState<string | null>(props.replayExecutionId || null);
    const [waSessions, setWaSessions] = useState<any[]>([]);

    // Fetch WhatsApp sessions once for NodePropertiesPanel session selectors
    useEffect(() => {
        let cancelled = false;
        api.get('/whatsapp/sessions')
            .then(r => { if (!cancelled) setWaSessions(r.data || []); })
            .catch(() => {}); // Silently fail — shown as empty list in UI
        return () => { cancelled = true; };
    }, []);

    // Fetch execution logs if replay mode is triggered
    useEffect(() => {
        if (!initialRuleId || !replayExecutionId) return;

        const loadReplayTrace = async () => {
            try {
                const { data } = await api.get(`/automations/${initialRuleId}/executions/${replayExecutionId}/logs`);
                const logs = data?.logs || [];
                
                // Map the logs to their corresponding nodes to inject status
                setNodes(currentNodes => currentNodes.map(node => {
                    const logForNode = logs.find((l: any) => l.nodeId === node.id);
                    if (logForNode) {
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                executionStatus: logForNode.status,
                                executionError: logForNode.error
                            }
                        };
                    }
                    return node;
                }));
            } catch (err) {
                console.error("Failed to load replay trace logs", err);
            }
        };

        loadReplayTrace();
    }, [initialRuleId, replayExecutionId, setNodes]);

    const onConnect = useCallback(
        (params: Connection | Edge) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
        [setEdges]
    );

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
    }, []);

    const updateNodeData = useCallback((nodeId: string, partialData: any) => {
        setNodes((nds) => 
            nds.map((n) => {
                if (n.id === nodeId) {
                    const merged = { ...n.data, ...partialData };
                    n.data = merged;
                    if (selectedNode?.id === nodeId) {
                        setSelectedNode({ ...n, data: merged });
                    }
                }
                return n;
            })
        );
    }, [setNodes, selectedNode]);

    const deleteNode = useCallback((nodeId: string) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        setSelectedNode(null);
    }, [setNodes, setEdges]);

    const duplicateNode = useCallback((nodeId: string) => {
        setNodes((nds) => {
            const nodeToDuplicate = nds.find(n => n.id === nodeId);
            if (!nodeToDuplicate) return nds;
            
            const newNode: Node = {
                ...nodeToDuplicate,
                id: getId(),
                position: { 
                    x: nodeToDuplicate.position.x + 50, 
                    y: nodeToDuplicate.position.y + 50 
                },
                selected: false
            };
            return nds.concat(newNode);
        });
    }, [setNodes]);

    const clearAllNodes = () => {
        setNodes(nds => nds.filter(n => n.type === 'trigger'));
        setEdges([]);
        setSelectedNode(null);
    };

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow/type');
            const actionType = event.dataTransfer.getData('application/reactflow/actionType');
            const label = event.dataTransfer.getData('application/reactflow/label');

            if (typeof type === 'undefined' || !type) {
                return;
            }

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // If dropping a trigger, replace the existing trigger node instead of adding a new one
            if (type === 'trigger') {
                setNodes((nds) => {
                    const existingTrigger = nds.find(n => n.type === 'trigger');
                    if (existingTrigger) {
                        return nds.map(n =>
                            n.type === 'trigger'
                                ? { ...n, position, data: { triggerType: actionType, label } }
                                : n
                        );
                    }
                    // No existing trigger, add one
                    return nds.concat({
                        id: 'trigger-1',
                        type: 'trigger',
                        position,
                        data: { triggerType: actionType, label },
                        deletable: false,
                    });
                });
                return;
            }

            const newNode: Node = {
                id: getId(),
                type,
                position,
                data: { actionType, label },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, setNodes]
    );

    const handleSave = async () => {
        setErrorMsg('');
        
        // Validation: Linear check
        const triggerNode = nodes.find(n => n.type === 'trigger');
        if (!triggerNode) {
            setErrorMsg('Flow must start with a Trigger');
            return;
        }

        const actionableNodes = nodes.filter(n => n.type !== 'trigger');
        if (actionableNodes.length === 0) {
            setErrorMsg('Flow must contain at least one step after the Trigger');
            return;
        }

        // Reachability check via BFS
        const visited = new Set<string>();
        const queue = [triggerNode.id];
        
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (!visited.has(currentId)) {
                visited.add(currentId);
                const outEdges = edges.filter(e => e.source === currentId);
                for (const edge of outEdges) {
                    queue.push(edge.target);
                }
            }
        }

        if (visited.size !== nodes.length) {
            setErrorMsg('All actions must be connected to the trigger path.');
            return;
        }

        const payload = {
            name: ruleName,
            description: `Visual graph automation flow`,
            trigger: { 
                type: triggerNode.data.triggerType || 'CONTACT_CREATED',
                ...triggerNode.data 
            },
            eventType: (triggerNode.data.triggerType as string || 'CONTACT_CREATED').toLowerCase(),
            actions: [], // Explicitly use graph engine exclusively on new saves
            flowDefinition: {
                nodes: nodes,
                edges: edges
            }
        };

        try {
            setIsSaving(true);
            if (savedRuleId) {
                await api.patch(`/automations/${savedRuleId}`, payload);
            } else {
                const res = await api.post('/automations', payload);
                setSavedRuleId(res.data?.id);
            }
            router.push('/automations');
            router.refresh();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.message || 'Failed to save automation rule');
            setIsSaving(false);
        }
    };

    const handleSimulate = async () => {
        setErrorMsg('');
        
        const triggerNode = nodes.find(n => n.type === 'trigger');
        if (!triggerNode) return setErrorMsg('Flow must start with a Trigger');

        const payload = {
            name: ruleName,
            description: `Visual graph automation flow`,
            trigger: { type: triggerNode.data.triggerType || 'CONTACT_CREATED', ...triggerNode.data },
            eventType: (triggerNode.data.triggerType as string || 'CONTACT_CREATED').toLowerCase(),
            actions: [],
            flowDefinition: { nodes, edges }
        };

        let targetRuleId = savedRuleId;
        try {
            setIsSimulating(true);
            if (targetRuleId) {
                await api.patch(`/automations/${targetRuleId}`, payload);
            } else {
                const res = await api.post('/automations', payload);
                targetRuleId = res.data?.id;
                setSavedRuleId(targetRuleId);
            }
        } catch (err: any) {
            setErrorMsg('Failed to save rule for simulation');
            setIsSimulating(false);
            return;
        }

        try {
            await api.post(`/automations/${targetRuleId}/simulate`, { testContactId: 'test-user-1' });
            setShowLogs(true);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.message || 'Simulation dispatch failed');
        } finally {
            setIsSimulating(false);
        }
    };

    return (
        <div className="flex flex-col h-screen w-full bg-base">
            {/* Topbar */}
            <div className="h-16 border-b border-theme bg-surface flex items-center justify-between px-6 z-10">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/automations')} title="Back to Automations" className="text-secondary hover:text-primary transition-colors font-medium">
                        &larr; Back
                    </button>
                    <div className="h-6 w-px bg-theme" />
                    <input 
                        type="text" 
                        value={ruleName} 
                        onChange={(e) => setRuleName(e.target.value)}
                        className="bg-transparent border-none text-lg font-bold text-primary focus:outline-none focus:ring-0 w-64 p-0"
                        placeholder="Rule Name"
                    />
                    {replayExecutionId && (
                        <div className="flex items-center gap-1.5 ml-4 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-md text-amber-500 font-medium text-xs">
                            <Clock size={14} />
                            Viewing Replay (Read-Only Status)
                            <button 
                                title="Exit replay mode"
                                onClick={() => {
                                    setReplayExecutionId(null);
                                    // Strip the execution statuses from the nodes
                                    setNodes(currentNodes => currentNodes.map(node => {
                                        const { executionStatus, executionError, ...cleanData } = node.data;
                                        return { ...node, data: cleanData };
                                    }));
                                }}
                                className="ml-2 hover:bg-amber-500/10 dark:bg-amber-500/20 p-0.5 rounded"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-4">
                    {errorMsg && (
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                            <AlertCircle size={16} />
                            <span>{errorMsg}</span>
                        </div>
                    )}
                    <button onClick={clearAllNodes} className="btn bg-body border border-theme text-red-500 hover:text-red-600 dark:text-red-400">
                        Clear Canvas
                    </button>
                    {savedRuleId && (
                        <button onClick={() => setShowLogs(true)} className="btn bg-elevated border border-theme text-primary flex items-center gap-2">
                            <Activity size={16} />
                            Logs
                        </button>
                    )}
                    <button onClick={handleSimulate} disabled={isSimulating} className="btn bg-elevated border border-theme text-success hover:border-success/30 flex items-center gap-2">
                        {isSimulating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                        Test Flow
                    </button>
                    <button onClick={() => setShowAIGenerator(true)} className="btn bg-elevated border border-blue-500/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-300 flex items-center gap-2">
                        <Sparkles size={16} />
                        AI Generate
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="btn btn-primary flex items-center gap-2 shadow-lg shadow-primary/20">
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save & Activate
                    </button>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 flex overflow-hidden">
                <Sidebar />
                <div className="flex-1 relative" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        nodeTypes={nodeTypes}
                    fitView
                    className="bg-base"
                    proOptions={{ hideAttribution: true }}
                >
                    <Background color="#1e1f29" gap={16} />
                    <Controls className="!bg-surface !border-theme !text-secondary" />
                    <MiniMap className="!bg-surface !border-theme" maskColor="rgba(0,0,0,0.2)" />
                </ReactFlow>

                <NodePropertiesPanel 
                    selectedNode={selectedNode} 
                    onClose={() => setSelectedNode(null)}
                    onUpdateNodeData={updateNodeData}
                    onDelete={deleteNode}
                    onDuplicate={duplicateNode}
                    sessions={waSessions}
                />

                {showLogs && savedRuleId && (
                    <ExecutionLogsPanel 
                        ruleId={savedRuleId}
                        onClose={() => setShowLogs(false)}
                    />
                )}

                {showAIGenerator && (
                    <AIFlowGenerator
                        onClose={() => setShowAIGenerator(false)}
                        onFlowGenerated={(name, genNodes, genEdges) => {
                            setRuleName(name);
                            setNodes(genNodes as Node[]);
                            setEdges(genEdges as Edge[]);
                        }}
                    />
                )}
            </div>
        </div>
    </div>
    );
}

export function FlowCanvas(props: FlowCanvasProps) {
    return (
        <ReactFlowProvider>
            <FlowCanvasInner {...props} />
        </ReactFlowProvider>
    );
}
