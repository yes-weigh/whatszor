'use client';

import { useState, useRef } from 'react';
import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UploadCloud, Image as ImageIcon, FileText, Trash2, Loader2, Link as LinkIcon, Download, Pencil, Check, X } from 'lucide-react';

const formatBytes = (bytes: number = 0, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export default function MediaGalleryPage() {
    const qc = useQueryClient();
    const [uploading, setUploading] = useState(false);
    const [filterType, setFilterType] = useState<string>('all');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch Media
    const { data: mediaResponse, isLoading } = useQuery({
        queryKey: ['media', filterType],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filterType !== 'all') params.append('type', filterType);
            const res = await api.get('/media-gallery?' + params.toString());
            // Fastify returns { media: [...] } normally
            return res.data?.media || [];
        },
    });

    const mediaList = mediaResponse || [];

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/media-gallery/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
    });

    const updateNameMutation = useMutation({
        mutationFn: ({ id, name }: { id: string, name: string }) => api.patch(`/media-gallery/${id}`, { name }),
        onSuccess: () => {
            setEditingId(null);
            qc.invalidateQueries({ queryKey: ['media'] });
        }
    });

    const handleSaveRename = (id: string) => {
        if (editName.trim()) {
            updateNameMutation.mutate({ id, name: editName.trim() });
        } else {
            setEditingId(null);
        }
    };

    // Upload Handle
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', 'general'); // Extensible later

            await api.post('/media-gallery', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            qc.invalidateQueries({ queryKey: ['media'] });
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error: any) {
            console.error('Upload failed:', error);
            alert(error.response?.data?.message || 'File upload failed (possibly too large or networking issue)');
        } finally {
            setUploading(false);
        }
    };

    const copyUrl = (id: string) => {
        const token = localStorage.getItem('accessToken');
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
        const url = `${baseUrl}/media-gallery/${id}/file?token=${token}`;
        navigator.clipboard.writeText(url);
        alert('Internal streaming URL copied to clipboard');
    };

    return (
        <div className="flex flex-col h-full bg-surface">
            <Header title="Media Gallery" subtitle="Manage images, videos, and documents for templates" />
            
            <div className="p-6 flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full">
                
                {/* Action Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 rounded-xl bg-elevated border border-theme shadow-sm">
                    {/* Filters */}
                    <div className="flex bg-surface rounded-lg p-1 border border-theme w-full sm:w-auto overflow-x-auto">
                        {[
                            { id: 'all', label: 'All Files' },
                            { id: 'image', label: 'Images' },
                            { id: 'video', label: 'Videos' },
                            { id: 'document', label: 'Documents' },
                        ].map((type) => (
                            <button
                                key={type.id}
                                onClick={() => setFilterType(type.id)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                    filterType === type.id 
                                    ? 'bg-accent text-white shadow-sm' 
                                    : 'text-muted hover:text-primary hover:bg-theme'
                                }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>

                    {/* Upload */}
                    <div>
                        <input 
                            title="Upload File"
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*,video/*,application/pdf"
                            onChange={handleFileUpload}
                            disabled={uploading}
                        />
                        <button 
                            className="btn btn-primary flex items-center gap-2"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                        >
                            {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                            {uploading ? 'Uploading...' : 'Upload Asset'}
                        </button>
                    </div>
                </div>

                {/* Grid */}
                {isLoading ? (
                    <div className="flex-1 flex justify-center items-center">
                        <Loader2 size={32} className="animate-spin text-muted" />
                    </div>
                ) : mediaList.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-theme rounded-xl bg-elevated/50 text-center p-12">
                        <div className="w-16 h-16 rounded-full bg-theme flex items-center justify-center mb-4 text-muted">
                            <ImageIcon size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-primary">No Media Found</h3>
                        <p className="text-muted mt-2 max-w-sm">
                            Upload images, videos, and PDFs to use in your WhatsApp message templates.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {mediaList.map((media: any) => {
                            const isImage = media.type === 'image';
                            const isVideo = media.type === 'video';
                            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
                            const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
                            const previewUrl = `${baseUrl}/media-gallery/${media.id}/file?token=${token}`;

                            return (
                                <div key={media.id} className="group relative flex flex-col rounded-xl overflow-hidden bg-elevated border border-theme shadow-sm transition-all hover:shadow-md hover:border-accent">
                                    
                                    {/* Preview Area */}
                                    <div className="relative aspect-square bg-theme flex items-center justify-center overflow-hidden">
                                        {isImage ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={previewUrl} alt={media.name} className="w-full h-full object-cover" />
                                        ) : isVideo ? (
                                            <video src={`${previewUrl}#t=0.001`} preload="metadata" className="w-full h-full object-cover">
                                                <track kind="captions" />
                                            </video>
                                        ) : (
                                            <div className="flex flex-col items-center text-muted">
                                                <FileText size={32} className="mb-2 opacity-50 text-red-400" />
                                                <span className="text-xs font-medium uppercase text-muted/70 tracking-wider">PDF</span>
                                            </div>
                                        )}
                                        
                                        {/* Hover Actions */}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                            <button 
                                                title="Copy Stream Link"
                                                onClick={() => copyUrl(media.id)}
                                                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors"
                                            >
                                                <LinkIcon size={14} />
                                            </button>
                                            <a 
                                                href={previewUrl} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                title="Download / View"
                                                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors"
                                            >
                                                <Download size={14} />
                                            </a>
                                            <button 
                                                title="Delete Media"
                                                onClick={() => { if(confirm('Are you sure you want to delete this file?')) deleteMutation.mutate(media.id); }}
                                                className="w-8 h-8 rounded-full bg-white/20 text-red-100 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Info Panel */}
                                    <div className="p-3">
                                        {editingId === media.id ? (
                                            <div className="flex items-center gap-1 mb-1">
                                                <input 
                                                    autoFocus
                                                    aria-label="Rename media"
                                                    className="flex-1 bg-surface border border-theme rounded px-1.5 py-0.5 text-xs text-primary outline-none"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(media.id)}
                                                />
                                                <button aria-label="Save" title="Save" onClick={() => handleSaveRename(media.id)} className="text-emerald-500 hover:text-emerald-400"><Check size={14} /></button>
                                                <button aria-label="Cancel" title="Cancel" onClick={() => setEditingId(null)} className="text-red-500 hover:text-red-400"><X size={14} /></button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between gap-2 group/edit">
                                                <h4 className="text-sm font-semibold text-primary truncate" title={media.name}>
                                                    {media.name}
                                                </h4>
                                                <button 
                                                    aria-label="Rename"
                                                    title="Rename"
                                                    onClick={() => { setEditingId(media.id); setEditName(media.name); }}
                                                    className="opacity-0 xl:opacity-0 sm:opacity-100 group-hover/edit:opacity-100 text-muted hover:text-primary transition-opacity shrink-0"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-xs text-muted uppercase tracking-wider">{formatBytes(media.size)}</span>
                                            <span className="text-[10px] uppercase font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                                                {media.type}
                                            </span>
                                        </div>
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
