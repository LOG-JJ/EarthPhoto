import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppLanguage } from '@shared/types/settings';

import { LanguageToggle } from './LanguageToggle';

export type SidebarTab = 'filters' | 'preview' | 'system' | 'cities';

interface SidebarProps {
  collapsed: boolean;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onToggleCollapsed: () => void;
  
  // Content Slots
  filtersSlot: ReactNode;
  previewSlot: ReactNode;
  systemSlot: ReactNode;
  citiesSlot: ReactNode;
  
  // System Tab Props
  rootPath: string | null;
  phaseText: string;
  watchEnabled: boolean;
  language: AppLanguage;
  onWatchEnabledChange: (enabled: boolean) => void;
  onLanguageChange: (language: AppLanguage) => void;
}

export function Sidebar({
  collapsed,
  activeTab,
  onTabChange,
  onToggleCollapsed,
  filtersSlot,
  previewSlot,
  systemSlot,
  citiesSlot,
  rootPath,
  phaseText,
  watchEnabled,
  language,
  onWatchEnabledChange,
  onLanguageChange,
}: SidebarProps) {
  const { t } = useTranslation();

  const handleDockClick = (tab: SidebarTab) => {
    if (collapsed) {
      onTabChange(tab);
      onToggleCollapsed();
    } else if (activeTab === tab) {
      onToggleCollapsed(); // Toggle off if clicking active
    } else {
      onTabChange(tab); // Switch tab
    }
  };

  const getTabTitle = (tab: SidebarTab) => {
    switch (tab) {
      case 'filters': return t('filters.title') || 'Search';
      case 'preview': return t('preview.title') || 'Inspect';
      case 'system': return t('sidebar.settings') || 'System';
      case 'cities': return t('sidebar.cities') || 'Cities';
      default: return '';
    }
  };

  return (
    <>
      {/* Modular Glass Card (Floating Panel) */}
      {!collapsed && (
        <div className="glass-card-container">
          <div className="glass-card">
            <header className="glass-card-header">
              <h2>{getTabTitle(activeTab)}</h2>
              <button 
                type="button" 
                className="card-close-btn" 
                onClick={onToggleCollapsed}
                aria-label={t('ui.closePanel')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="glass-card-content">
              {activeTab === 'filters' && filtersSlot}
              
              {activeTab === 'preview' && previewSlot}
              
              {activeTab === 'system' && (
                <div className="system-panel">
                  <LanguageToggle language={language} onChange={onLanguageChange} />
                  
                  <section className="panel">
                    <h3>{t('sidebar.selectedFolder')}</h3>
                    <p className="path-text">{rootPath ?? t('sidebar.none')}</p>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={watchEnabled}
                        onChange={(event) => onWatchEnabledChange(event.target.checked)}
                      />
                      {t('sidebar.watch')}
                    </label>
                  </section>
  
                  <section className="panel">
                    <h3>{t('progress.phase')}</h3>
                    <p className="status-text">{phaseText}</p>
                  </section>
  
                  {systemSlot}
                </div>
              )}

              {activeTab === 'cities' && citiesSlot}
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Floating Dock */}
      <nav className="floating-dock-container">
        <button 
          type="button"
          className={`dock-item ${activeTab === 'filters' && !collapsed ? 'active' : ''}`}
          onClick={() => handleDockClick('filters')}
        >
          <span className="dock-tooltip">{t('filters.title')}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>

        <button 
          type="button"
          className={`dock-item ${activeTab === 'preview' && !collapsed ? 'active' : ''}`}
          onClick={() => handleDockClick('preview')}
        >
          <span className="dock-tooltip">{t('preview.title')}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        <button 
          type="button"
          className={`dock-item ${activeTab === 'system' && !collapsed ? 'active' : ''}`}
          onClick={() => handleDockClick('system')}
        >
          <span className="dock-tooltip">{t('sidebar.settings')}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        <button
          type="button"
          className={`dock-item ${activeTab === 'cities' && !collapsed ? 'active' : ''}`}
          onClick={() => handleDockClick('cities')}
        >
          <span className="dock-tooltip">{t('sidebar.cities')}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4.3 8-11a8 8 0 1 0-16 0c0 6.7 8 11 8 11Z" />
            <circle cx="12" cy="11" r="2.5" />
          </svg>
        </button>
      </nav>
    </>
  );
}
