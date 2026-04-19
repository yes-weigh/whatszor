import React from 'react';

const variants = {
    default: 'bg-elevated text-secondary border-theme',
    primary: 'bg-accent/10 text-accent border-accent/20',
    success: 'bg-green-500/10 text-green-500 border-green-500/20',
    warning: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    danger: 'bg-red-500/10 text-red-500 border-red-500/20',
    outline: 'bg-transparent text-secondary border-theme',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: keyof typeof variants;
}

export function Badge({ children, variant = 'default', className = '', ...props }: BadgeProps) {
    return (
        <span 
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${variants[variant]} ${className}`}
            {...props}
        >
            {children}
        </span>
    );
}
