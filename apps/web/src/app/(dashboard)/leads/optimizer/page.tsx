'use client';

import React, { useState } from 'react';
import { useOptimizer } from '@/hooks/useOptimizer';
import { Button } from '@/components/ui/Button';

const GRID_LABELS = ['NW', 'N', 'NE', 'W', 'Center', 'E', 'SW', 'S', 'SE'];

export default function LeadOptimizerPage() {
    const {
        generatePlan,
        isGeneratingPlan,
        planResult,
        executeCampaign,
        isExecuting,
        plans,
        isPolling
    } = useOptimizer();

    const [city, setCity] = useState('');
    const [keywords, setKeywords] = useState('');
    const [maxBudget, setMaxBudget] = useState('500');

    // UI State for selections
    const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());

    const handleGeneratePlan = async () => {
        if (!city || !keywords) return;
        const keywordList = keywords.split(',').map(k => k.trim()).filter(Boolean);
        const res = await generatePlan({
            city,
            keywords: keywordList,
            maxBudget: parseInt(maxBudget, 10)
        });
        
        // Auto-select recommended queries
        if (res && res.plan) {
            const recommended = new Set<string>();
            res.plan.forEach((p: any) => {
                // If overlap is < 40%, we auto-select it. (preOverlapScore < 0.4)
                if (p.preOverlapScore < 0.4) {
                    recommended.add(p.id || p.keyword + p.microArea); // use composite if id missing in draft
                }
            });
            setSelectedPlanIds(recommended);
        }
    };

    const currentPlans = plans.length > 0 ? plans : (planResult?.plan || []);

    const handleExecute = async () => {
        if (!planResult || selectedPlanIds.size === 0) return;
        
        await executeCampaign({
            planBatchId: planResult.planBatchId,
            selectedPlanIds: Array.from(selectedPlanIds)
        });
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedPlanIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedPlanIds(next);
    };

    const getStatusLabel = (plan: any) => {
        if (plan.status === 'COOLDOWN') return 'Cooldown Active';
        if (plan.status === 'KILLED' || plan.killSwitchFired) return 'Saturated (Killed)';
        if (plan.preOverlapScore > 0.5) return 'High Overlap';
        return 'Good';
    };

    const getStatusColor = (plan: any) => {
        const label = getStatusLabel(plan);
        switch (label) {
            case 'Good': return 'bg-green-500/20 text-green-400';
            case 'High Overlap': return 'bg-orange-500/20 text-orange-400';
            case 'Cooldown Active':
            case 'Saturated (Killed)': return 'bg-red-500/20 text-red-400';
            default: return 'bg-zinc-500/20 text-zinc-400';
        }
    };

    const totalEstimated = currentPlans
        ?.filter((p: any) => selectedPlanIds.has(p.id || p.keyword + p.microArea))
        .reduce((sum: number, p: any) => sum + p.estimatedLeads, 0) || 0;

    // Helper for grid
    const getGridStatus = (label: string) => {
        const areaPlans = currentPlans.filter((p: any) => p.microArea === label);
        if (areaPlans.length === 0) return 'unexplored';
        
        // if any plan killed
        if (areaPlans.some((p: any) => p.status === 'KILLED' || p.killSwitchFired)) return 'saturated';
        // if any plan running/done
        if (areaPlans.some((p: any) => ['RUNNING', 'DONE'].includes(p.status))) return 'explored';
        
        return 'planned';
    };

    const gridColors = {
        unexplored: 'bg-zinc-800/50 border-zinc-700 text-zinc-500',
        planned: 'bg-brand-500/20 border-brand-500/50 text-brand-300',
        explored: 'bg-green-500/20 border-green-500/50 text-green-300',
        saturated: 'bg-red-500/20 border-red-500/50 text-red-300'
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Lead Generation Optimizer</h1>
                    <p className="text-zinc-400">AI-powered campaign planning & execution</p>
                </div>
                {planResult && (
                    <Button 
                        onClick={handleExecute} 
                        disabled={isExecuting || isPolling || selectedPlanIds.size === 0}
                        className="bg-brand-500 hover:bg-brand-600 text-white"
                    >
                        {isExecuting || isPolling ? 'Executing Campaign...' : `Run ${selectedPlanIds.size} Queries → ~${totalEstimated} Leads`}
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Panel 1: Setup */}
                <div className="bg-elevated border border-theme rounded-xl p-6 space-y-4 col-span-1 h-fit">
                    <h2 className="text-lg font-semibold text-white">Campaign Setup</h2>
                    
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none text-zinc-300">Target City</label>
                        <input 
                            type="text" 
                            className="input-base" 
                            placeholder="e.g. New York"
                            value={city}
                            onChange={e => setCity(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none text-zinc-300">Keywords (comma separated)</label>
                        <input 
                            type="text" 
                            className="input-base" 
                            placeholder="e.g. real estate, broker, agent"
                            value={keywords}
                            onChange={e => setKeywords(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none text-zinc-300">Max Queries / Budget</label>
                        <select 
                            className="input-base"
                            value={maxBudget}
                            onChange={e => setMaxBudget(e.target.value)}
                            aria-label="Max Budget"
                        >
                            <option value="100">Starter (100 queries)</option>
                            <option value="500">Growth (500 queries)</option>
                            <option value="2000">Scale (2000 queries)</option>
                        </select>
                    </div>

                    <Button 
                        onClick={handleGeneratePlan}
                        disabled={isGeneratingPlan || !city || !keywords}
                        className="w-full mt-4"
                    >
                        {isGeneratingPlan ? 'Analyzing Market...' : 'Generate Plan'}
                    </Button>
                </div>

                {/* Panel 2 & 3: Results */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Coverage View */}
                    <div className="bg-elevated border border-theme rounded-xl p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">Market Coverage</h2>
                        <div className="grid grid-cols-3 gap-2 aspect-[3/1]">
                            {GRID_LABELS.map((label) => {
                                const status = getGridStatus(label);
                                return (
                                    <div key={label} className={`rounded-md border flex items-center justify-center transition-colors ${gridColors[status]}`}>
                                        <span className="text-xs font-medium">{label}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex gap-4 mt-4 text-xs text-zinc-400 justify-center">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-600"></span> Unexplored</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-500"></span> Planned</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Explored</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Saturated</span>
                        </div>
                    </div>

                    {/* Query Plan Table */}
                    <div className="bg-elevated border border-theme rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-theme flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-white">Query Plan</h2>
                            {planResult && <span className="text-sm text-zinc-400">{currentPlans.length || 0} candidates found</span>}
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-zinc-800/50 text-zinc-400">
                                    <tr>
                                        <th className="p-4 font-medium">Select</th>
                                        <th className="p-4 font-medium">Query</th>
                                        <th className="p-4 font-medium">Est. Leads</th>
                                        <th className="p-4 font-medium">Overlap</th>
                                        <th className="p-4 font-medium">Reason</th>
                                        <th className="p-4 font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800">
                                    {currentPlans.map((plan: any) => {
                                        const planId = plan.id || plan.keyword + plan.microArea;
                                        const isSelected = selectedPlanIds.has(planId);
                                        const label = getStatusLabel(plan);
                                        
                                        return (
                                            <tr key={planId} className={`hover:bg-zinc-800/30 transition-colors ${!isSelected ? 'opacity-50' : ''}`}>
                                                <td className="p-4">
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded border-zinc-700 bg-zinc-900 text-brand-500 focus:ring-brand-500"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelection(planId)}
                                                        title="Select Plan"
                                                        aria-label="Select Plan"
                                                    />
                                                </td>
                                                <td className="p-4 font-medium text-white">{plan.keyword} <span className="text-xs text-zinc-500 block">({plan.microArea})</span></td>
                                                <td className="p-4">{Math.round(plan.estimatedLeads)}</td>
                                                <td className="p-4">{Math.round(plan.preOverlapScore * 100)}%</td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(plan)}`}>
                                                        {label}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-zinc-400">{plan.status}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {currentPlans.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-zinc-500">
                                                Generate a plan to see query recommendations.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
