'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { 
    X, 
    Image as ImageIcon, 
    Video, 
    FileText, 
    Search,
    Loader2,
    CheckCircle2
} from 'lucide-react';

interface MediaGalleryPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (media: any) => void;
}

export function MediaGalleryPicker({ isOpen, onClose, onSelect }: MediaGalleryPickerProps) {
    const [filterType, setFilterType] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const { data: mediaResponse, isLoading } = useQuery({
        queryKey: ['media-picker', filterType],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filterType !== 'all') params.append('type', filterType);
            const res = await api.get('/media-gallery?' + params.toString());
            return res.data?.media || [];
        },
        enabled: isOpen,
    });

    const mediaList = (mediaResponse || []).filter((m: any) => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!isOpen) return null;

    const handleConfirm = () => {
        const selected = mediaList.find((m: any) => m.id === selectedId);
        if (selected) {
            onSelect(selected);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-elevated w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl border border-theme flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="p-4 border-b border-theme flex items-center justify-between bg-surface/50">
                    <div>
                        <h2 className="text-xl font-bold text-primary">Media Gallery</h2>
                        <p className="text-xs text-muted">Select an existing asset to send</p>
                    </div>
                    <button 
                        onClick={onClose}
                        title="Close Gallery"
                        className="p-2 rounded-lg hover:bg-theme text-muted transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Filters & Search */}
                <div className="p-4 border-b border-theme bg-surface/30 flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex bg-theme/50 rounded-lg p-1 border border-theme w-full md:w-auto">
                        {[
                            { id: 'all', label: 'All' },
                            { id: 'image', label: 'Images' },
                            { id: 'video', label: 'Videos' },
                            { id: 'document', label: 'Docs' },
                        ].map((type) => (
                            <button
                                key={type.id}
                                onClick={() => setFilterType(type.id)}
                                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                    filterType === type.id 
                                    ? 'bg-accent text-white shadow-sm' 
                                    : 'text-muted hover:text-primary'
                                }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>

                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                        <input 
                            type="text"
                            placeholder="Search by filename..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-theme/30 border border-theme rounded-xl text-sm focus:outline-none focus:border-accent transition-all"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {isLoading ? (
                        <div className="h-64 flex flex-col items-center justify-center text-muted gap-3">
                            <Loader2 size={32} className="animate-spin text-accent" />
                            <p className="text-sm font-medium">Loading your library...</p>
                        </div>
                    ) : mediaList.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-theme rounded-2xl bg-theme/10 text-center p-8">
                            <ImageIcon size={48} className="text-muted/30 mb-3" />
                            <h3 className="text-lg font-bold text-primary">No Assets Found</h3>
                            <p className="text-sm text-muted">Try a different filter or search term</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {mediaList.map((media: any) => {
                                const isSelected = selectedId === media.id;
                                const isImage = media.type === 'image';
                                const isVideo = media.type === 'video';
                                const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
                                const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
                                const previewUrl = `${baseUrl}/media-gallery/${media.id}/file?token=${token}`;

                                return (
                                    <div 
                                        key={media.id}
                                        onClick={() => setSelectedId(media.id)}
                                        className={`group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                                            isSelected 
                                            ? 'border-accent ring-2 ring-accent/20' 
                                            : 'border-theme hover:border-accent/50 bg-theme/20'
                                        }`}
                                    >
                                        <div className="absolute inset-0 flex items-center justify-center p-2">
                                            {isImage ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={previewUrl} alt={media.name} className="w-full h-full object-cover rounded-md" />
                                            ) : isVideo ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <Video size={24} className="text-muted" />
                                                    <span className="text-[10px] font-bold text-muted/60 uppercase">Video</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <FileText size={24} className="text-red-400" />
                                                    <span className="text-[10px] font-bold text-muted/60 uppercase">PDF</span>
                                                </div>
                                            )}
                                        </div>

                                        {isSelected && (
                                            <div className="absolute top-2 right-2 bg-accent text-white rounded-full p-0.5 shadow-lg animate-in zoom-in duration-200">
                                                <CheckCircle2 size={16} />
                                            </div>
                                        )}

                                        <div className="absolute bottom-0 inset-x-0 bg-black/70 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <p className="text-[10px] text-white font-medium truncate">{media.name}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-theme bg-surface/50 flex justify-between items-center">
                    <p className="text-xs text-muted">
                        {selectedId ? '1 item selected' : 'No item selected'}
                    </p>
                    <div className="flex gap-3">
                        <button 
                            onClick={onClose}
                            className="btn btn-secondary py-1.5 px-4 text-xs"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleConfirm}
                            disabled={!selectedId}
                            className="btn btn-primary py-1.5 px-6 text-xs font-bold"
                        >
                            Select Media
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
