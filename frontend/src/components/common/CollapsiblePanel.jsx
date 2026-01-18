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
            borderBottom: '1px solid #e0e0e0',
            backgroundColor: '#fff',
            overflow: 'hidden'
        }}>
            <div
                onClick={toggle}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: isOpen ? '#fcfcfc' : '#fff',
                    transition: 'background-color 0.2s ease',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#333'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isOpen ? '#fcfcfc' : '#fff'}
            >
                <span style={{
                    marginRight: '8px',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'inline-block',
                    width: '20px',
                    height: '20px',
                    textAlign: 'center',
                    lineHeight: '20px',
                    color: '#888'
                }}>
                    {icon}
                </span>
                {title}
            </div>

            <div
                ref={contentRef}
                style={{
                    height: height,
                    opacity: isOpen ? 1 : 0,
                    transition: 'height 0.3s ease, opacity 0.3s ease',
                    overflow: 'hidden'
                }}
            >
                <div style={{ padding: '0 16px 16px 16px' }}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default CollapsiblePanel;
