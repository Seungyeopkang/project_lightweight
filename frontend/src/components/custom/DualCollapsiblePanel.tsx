import React, { useState, ReactNode } from 'react';
import styles from './DualCollapsiblePanel.module.css';

/**
 * DualCollapsiblePanel Component
 * Based on Figma Dashboard Design with Glassmorphism
 * 
 * Specs:
 * - Background: Dark Gradient (linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%))
 * - Panel: Glassmorphism (backdrop-filter: blur(20px), rgba(255,255,255,0.1))
 * - Animation: transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
 */

interface DualCollapsiblePanelProps {
    sidebarContent: ReactNode;
    children: ReactNode;
    rightContent?: ReactNode;
    userName?: string;
    userRole?: string;
}

const DualCollapsiblePanel: React.FC<DualCollapsiblePanelProps> = ({
    sidebarContent,
    children,
    rightContent,
    userName = "Seungyeop Kang",
    userRole = "Premium Account"
}) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isRightCollapsed, setIsRightCollapsed] = useState(false);

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed);
    };

    const toggleRightSidebar = () => {
        setIsRightCollapsed(!isRightCollapsed);
    };

    return (
        <div className={styles.wrapper}>
            {/* Sidebar Section */}
            <aside
                className={`${styles.sidebar} ${isSidebarCollapsed ? styles.sidebarCollapsed : ''}`}
            >
                <div className={styles.sidebarInner}>
                    {/* Brand Branding */}
                    <div className={styles.logoSection}>
                        <div className={styles.logoIcon}>O</div>
                        <span className={styles.logoText}>ONNX Opt</span>
                    </div>

                    {/* Navigation/Sidebar Content Area */}
                    <nav className={styles.nav}>
                        {sidebarContent}
                    </nav>

                    {/* User Profile Footer */}
                    <div className={styles.sidebarFooter}>
                        <div className={styles.userProfile}>
                            <div className={styles.avatar}>
                                {userName.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div className={styles.userInfo}>
                                <div className={styles.userName}>{userName}</div>
                                <div className={styles.userRole}>{userRole}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Floating Toggle Button */}
                <button
                    className={styles.toggleButton}
                    onClick={toggleSidebar}
                    aria-label={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    <span className={styles.arrowIcon}>
                        {isSidebarCollapsed ? '→' : '←'}
                    </span>
                </button>
            </aside>

            {/* Main Content Area */}
            <main className={styles.mainContainer}>
                <div className={styles.mainPanel}>
                    {children}
                </div>
            </main>

            {/* Optional Right Panel - Can be integrated if needed */}
            {rightContent && (
                <aside className={`${styles.rightPanel} ${isRightCollapsed ? styles.rightPanelCollapsed : ''}`}>
                    <button
                        className={styles.rightToggleButton}
                        onClick={toggleRightSidebar}
                        aria-label={isRightCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    >
                        <span className={styles.arrowIcon}>
                            {isRightCollapsed ? '←' : '→'}
                        </span>
                    </button>
                    <div className={styles.rightPanelContent}>
                        {rightContent}
                    </div>
                </aside>
            )}
        </div>
    );
};

export default DualCollapsiblePanel;
