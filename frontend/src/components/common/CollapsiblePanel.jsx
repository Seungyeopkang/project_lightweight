import React, { useState, useRef, useEffect } from 'react';

const CollapsiblePanel = ({ title, children, defaultOpen = false, icon = "▶" }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const contentRef = useRef(null);
    const [height, setHeight] = useState(defaultOpen ? 'auto' : '0px');

    const toggle = () => {
        setIsOpen(!isOpen);
    };

    useEffect(() => {
        if (isOpen) {
            const scrollHeight = contentRef.current.scrollHeight;
            setHeight(`${scrollHeight}px`);
            // After transition, set to auto to allow dynamic content changes
            const timer = setTimeout(() => {
                setHeight('auto');
            }, 300);
            return () => clearTimeout(timer);
        } else {
            // Set fixed height first for transition to work from auto
            if (contentRef.current) {
                setHeight(`${contentRef.current.scrollHeight}px`);
                // Force reflow
                // eslint-disable-next-line no-unused-expressions
                contentRef.current.offsetHeight;
                setTimeout(() => {
                    setHeight('0px');
                }, 10);
            }
        }
    }, [isOpen]);

    return (
        <div style={{
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: 'transparent',
            overflow: 'hidden',
            marginBottom: '8px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
            <div
                onClick={toggle}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: isOpen ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    transition: 'all 0.2s ease',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#e0e0e0',
                    borderRadius: isOpen ? '12px 12px 0 0' : '12px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isOpen ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)'}
            >
                <span style={{
                    marginRight: '12px',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'inline-block',
                    width: '20px',
                    height: '20px',
                    textAlign: 'center',
                    lineHeight: '20px',
                    color: '#94a3b8'
                }}>
                    ▶
                </span>
                {icon && <span style={{ marginRight: '10px', fontSize: '16px' }}>{icon}</span>}
                {title}
            </div>

            <div
                ref={contentRef}
                style={{
                    height: height,
                    opacity: isOpen ? 1 : 0,
                    transition: 'height 0.3s ease, opacity 0.3s ease',
                    overflow: 'hidden',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)'
                }}
            >
                <div style={{ padding: '16px' }}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default CollapsiblePanel;
