'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, CornerDownRight, Check, PlayCircle, Loader2, Save, RefreshCw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProductReviewPage({ params }: { params: { id: string } }) {
    const queryClient = useQueryClient();
    const productId = params.id;

    // Local State for Edit mode
    const [editSpecs, setEditSpecs] = useState('');
    const [editFeatures, setEditFeatures] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const { data: productResp, isLoading: loadP } = useQuery({
        queryKey: ['product', productId],
        queryFn: () => api.get(`/products`).then(r => r.data?.products?.find((p: any) => p.id === productId))
    });

    const { data: sourcesResp, isLoading: loadS } = useQuery({
        queryKey: ['sources', productId],
        queryFn: () => api.get(`/products/${productId}/sources`).then(r => r.data?.data)
    });

    useEffect(() => {
        if (productResp) {
            setEditSpecs(JSON.stringify(productResp.specifications || {}, null, 2));
            setEditFeatures(JSON.stringify((productResp.specifications?.features as string[]) || [], null, 2));
            setEditDesc(productResp.description || '');
        }
    }, [productResp]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            let parsedSpecs = {};
            let parsedFeatures = [];
            try { parsedSpecs = JSON.parse(editSpecs); } catch(e) {}
            try { parsedFeatures = JSON.parse(editFeatures); } catch(e) {}

            await api.patch(`/products/${productId}`, {
                description: editDesc,
                specifications: { ...parsedSpecs, features: parsedFeatures }
            });
            toast.success('Product updated manually');
            queryClient.invalidateQueries({ queryKey: ['product', productId] });
        } catch (error) {
            toast.error('Failed to update product details');
        }
        setIsSaving(false);
    };

    const handleApplySource = async (sourceId: string, extractedSpecs: any, extractedDesc: any, extractedFeatures: any) => {
        try {
            await api.post(`/products/${productId}/sources/${sourceId}/apply`, {
                description: extractedDesc,
                specifications: extractedSpecs,
                features: extractedFeatures
            });
            toast.success('Source fields merged successfully');
            queryClient.invalidateQueries({ queryKey: ['product', productId] });
            queryClient.invalidateQueries({ queryKey: ['sources', productId] });
        } catch (error) {
            toast.error('Failed to apply source');
        }
    };

    const handleRejectSource = async (sourceId: string) => {
        try {
            await api.post(`/products/${productId}/sources/${sourceId}/reject`);
            toast.success('Source discarded');
            queryClient.invalidateQueries({ queryKey: ['sources', productId] });
        } catch (error) {
            toast.error('Failed to reject source');
        }
    };

    const handleReprocessSource = async (sourceId: string) => {
        try {
            await api.post(`/products/sources/${sourceId}/reprocess`);
            toast.success('Source queued for reprocessing');
            queryClient.invalidateQueries({ queryKey: ['sources', productId] });
        } catch (error) {
            toast.error('Failed to trigger reprocessing. Check backend logs.');
        }
    };

    const handleVerify = async () => {
        try {
            await api.post(`/products/${productId}/verify`);
            toast.success('Product marked as VERIFIED');
            queryClient.invalidateQueries({ queryKey: ['product', productId] });
        } catch (error) {
             toast.error('Failed to verify product');
        }
    };

    if (loadP || loadS) return <div className="p-8 text-center text-muted"><Loader2 className="animate-spin inline mr-2" /> Loading Review Pipeline...</div>;
    if (!productResp) return <div className="p-8 text-center text-warning">Product not found.</div>;

    return (
        <div className="flex flex-col h-full bg-[var(--bg-main)]">
            <Header title={`Reviewing: ${productResp.name}`} subtitle={`SKU: ${productResp.sku || 'N/A'} • Status: ${productResp.status}`} />
            
            <div className="flex-1 overflow-hidden p-6">
                <div className="flex gap-6 h-[calc(100vh-140px)]">
                    
                    {/* LEFT PANEL: PRODUCT DATA (EDITABLE) */}
                    <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2 pb-12">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-primary">Core Product Data</h2>
                            <div className="flex gap-2">
                                <button onClick={handleSave} disabled={isSaving} className="btn bg-accent text-white px-3 py-1.5 text-sm rounded-lg hover:bg-accent/90 focus:ring-2 focus:ring-accent/50 transition">
                                    <Save size={14} className="inline mr-1"/> Save Edits
                                </button>
                                <button onClick={handleVerify} className="btn bg-success text-white px-3 py-1.5 text-sm rounded-lg hover:bg-success/90 focus:ring-2 focus:ring-success/50 transition">
                                    <CheckCircle size={14} className="inline mr-1"/> Mark Verified
                                </button>
                            </div>
                        </div>

                        <div className="card w-[95%]">
                            <label htmlFor="editDesc" className="text-sm font-semibold text-secondary mb-1 block">Description</label>
                            <textarea id="editDesc" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} className="w-full bg-[var(--bg-main)] border border-[var(--border-theme)] rounded-lg p-3 text-sm focus:ring-2 transition focus:ring-accent focus:border-accent text-primary" />
                        </div>

                        <div className="card w-[95%]">
                            <label htmlFor="editSpecs" className="text-sm font-semibold text-secondary mb-1 block">Specifications (JSON Array/Map)</label>
                            <textarea id="editSpecs" value={editSpecs} onChange={(e) => setEditSpecs(e.target.value)} rows={10} className="w-full font-mono bg-[var(--bg-main)] border border-[var(--border-theme)] rounded-lg p-3 text-sm focus:ring-2 transition focus:ring-accent focus:border-accent text-primary" />
                        </div>

                        <div className="card w-[95%]">
                            <label htmlFor="editFeatures" className="text-sm font-semibold text-secondary mb-1 block">Features (JSON Array)</label>
                            <textarea id="editFeatures" value={editFeatures} onChange={(e) => setEditFeatures(e.target.value)} rows={6} className="w-full font-mono bg-[var(--bg-main)] border border-[var(--border-theme)] rounded-lg p-3 text-sm focus:ring-2 transition focus:ring-accent focus:border-accent text-primary" />
                        </div>
                    </div>

                    {/* RIGHT PANEL: SOURCE TIMELINE */}
                    <div className="w-1/2 flex flex-col gap-4 overflow-y-auto border-l border-[var(--border-theme)] pl-6 pb-12">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg font-bold text-primary">Extraction Sources</h2>
                        </div>

                        {sourcesResp?.length === 0 && <p className="text-sm text-muted">No AI extraction sources mapped yet.</p>}

                        {sourcesResp?.map((source: any) => (
                            <div key={source.id} className="card relative transition hover:border-[var(--border-strong)]">
                                
                                {/* Status Badge Overlay */}
                                <div className="absolute top-4 right-4 text-xs font-bold px-2 py-1 rounded border">
                                    {source.status === 'APPLIED' && <span className="text-success border-success/30 bg-success/10"><Check size={12} className="inline mr-1"/> APPLIED</span>}
                                    {source.status === 'CONFLICT' && <span className="text-warning border-warning/30 bg-warning/10"><XCircle size={12} className="inline mr-1"/> CONFLICT</span>}
                                    {source.status === 'FAILED_VALIDATION' && <span className="text-danger border-danger/30 bg-danger/10"><XCircle size={12} className="inline mr-1"/> FAILED</span>}
                                    {source.status === 'ORPHANED' && <span className="text-accent border-accent/30 bg-accent/10"><AlertCircle size={12} className="inline mr-1"/> ORPHANED</span>}
                                    {source.status === 'DISCARDED' && <span className="text-muted border-muted/30 bg-muted/10">DISCARDED</span>}
                                    {(source.status !== 'APPLIED' && source.status !== 'CONFLICT' && source.status !== 'DISCARDED' && source.status !== 'FAILED_VALIDATION' && source.status !== 'ORPHANED') && <span>{source.status}</span>}
                                </div>

                                <h3 className="text-sm font-semibold text-secondary mb-2">
                                    Source: {source.dataType} 
                                    <span className="text-muted text-xs font-normal ml-2">Score: <span className={source.globalConfidence >= 85 ? 'text-success font-bold' : 'text-warning font-bold'}>{source.globalConfidence}%</span></span>
                                </h3>

                                <div className="text-sm text-primary mb-3">
                                    {source.sender && <p className="mb-1"><strong>Sender:</strong> {source.sender.name || source.sender.phone}</p>}
                                    {source.rawContentUrl && (
                                        <p className="mb-1"><a href={source.rawContentUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline flex items-center gap-1"><PlayCircle size={14}/> View Media Attachment</a></p>
                                    )}
                                    <div className="bg-[var(--bg-main)] p-2 rounded border border-[var(--border-theme)] mt-2 font-mono text-xs overflow-x-auto">
                                        <strong className="text-muted block mb-1">Extracted Payload:</strong>
                                        <pre>{JSON.stringify(source.extractedData, null, 2)}</pre>
                                    </div>
                                    <div className="bg-[var(--bg-main)] p-2 rounded border border-[var(--border-theme)] mt-2 font-mono text-xs overflow-x-auto">
                                        <strong className="text-muted block mb-1">Field Confidences:</strong>
                                        <pre>{JSON.stringify(source.fieldConfidence, null, 2)}</pre>
                                    </div>
                                </div>

                                {/* Actions */}
                                {(source.status === 'CONFLICT' || source.status === 'ORPHANED' || source.status === 'FAILED_VALIDATION') && (
                                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--border-theme)]">
                                        {(source.status === 'CONFLICT' || source.status === 'ORPHANED') && (
                                            <button 
                                                onClick={() => handleApplySource(source.id, source.extractedData?.specifications, source.extractedData?.description, source.extractedData?.features)}
                                                className="px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 rounded transition flex items-center gap-1">
                                                <CornerDownRight size={14}/> Force Apply
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => handleReprocessSource(source.id)}
                                            className="px-3 py-1.5 text-xs font-medium bg-secondary/10 text-secondary hover:bg-secondary/20 rounded transition flex items-center gap-1">
                                            <RefreshCw size={14}/> Reprocess AI
                                        </button>
                                        <button 
                                            onClick={() => handleRejectSource(source.id)}
                                            className="px-3 py-1.5 text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 rounded transition flex items-center gap-1">
                                            <XCircle size={14}/> Discard
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                </div>
            </div>
        </div>
    );
}
