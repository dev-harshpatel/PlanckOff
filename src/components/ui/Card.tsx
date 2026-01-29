import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    hoverable?: boolean;
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    onClick,
    hoverable = false,
    padding = 'md',
}) => {
    return (
        <div
            onClick={onClick}
            className={`
                bg-white border border-slate-200 rounded-xl
                ${paddingStyles[padding]}
                ${hoverable ? 'hover:border-blue-500 hover:shadow-md cursor-pointer' : ''}
                ${onClick ? 'cursor-pointer' : ''}
                transition-all
                ${className}
            `.trim().replace(/\s+/g, ' ')}
        >
            {children}
        </div>
    );
};

// Card sub-components
interface CardHeaderProps {
    children: React.ReactNode;
    className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '' }) => (
    <div className={`mb-4 ${className}`}>
        {children}
    </div>
);

interface CardTitleProps {
    children: React.ReactNode;
    className?: string;
}

export const CardTitle: React.FC<CardTitleProps> = ({ children, className = '' }) => (
    <h3 className={`font-bold text-lg text-slate-900 leading-tight ${className}`}>
        {children}
    </h3>
);

interface CardDescriptionProps {
    children: React.ReactNode;
    className?: string;
}

export const CardDescription: React.FC<CardDescriptionProps> = ({ children, className = '' }) => (
    <p className={`text-sm text-slate-500 mt-1 ${className}`}>
        {children}
    </p>
);

interface CardContentProps {
    children: React.ReactNode;
    className?: string;
}

export const CardContent: React.FC<CardContentProps> = ({ children, className = '' }) => (
    <div className={className}>
        {children}
    </div>
);

interface CardFooterProps {
    children: React.ReactNode;
    className?: string;
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, className = '' }) => (
    <div className={`mt-5 pt-4 border-t border-slate-100 ${className}`}>
        {children}
    </div>
);
