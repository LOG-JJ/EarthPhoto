import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppLanguage } from '@shared/types/settings';

import type { AppTab } from '@renderer/domain/app/appTabs';

import { LanguageToggle } from './LanguageToggle';

interface SidebarProps {
  collapsed: boolean;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onToggleCollapsed: () => void;

  filtersSlot: ReactNode;
  previewSlot: ReactNode;
  calendarSlot: ReactNode;
  systemSlot: ReactNode;
  citiesSlot: ReactNode;

  rootPath: string | null;
  phaseText: string;
  watchEnabled: boolean;
  timelineOverlayEnabled: boolean;
  language: AppLanguage;
  onWatchEnabledChange: (enabled: boolean) => void;
  onToggleTimelineOverlay: () => void;
  onLanguageChange: (language: AppLanguage) => void;
}

export function Sidebar({
  collapsed,
  activeTab,
  onTabChange,
  onToggleCollapsed,
  filtersSlot,
  previewSlot,
  calendarSlot,
  systemSlot,
  citiesSlot,
  rootPath,
  phaseText,
  watchEnabled,
  timelineOverlayEnabled,
  language,
  onWatchEnabledChange,
  onToggleTimelineOverlay,
  onLanguageChange,
}: SidebarProps) {
  const { t } = useTranslation();

  const handleDockClick = (tab: AppTab) => {
    if (collapsed) {
      onTabChange(tab);
      onToggleCollapsed();
    } else if (activeTab === tab) {
      onToggleCollapsed();
    } else {
      onTabChange(tab);
    }
  };

  const getTabTitle = (tab: AppTab) => {
    switch (tab) {
      case 'filters':
        return t('filters.title') || 'Search';
      case 'preview':
        return t('preview.title') || 'Inspect';
      case 'calendar':
        return t('calendar.title') || 'Calendar';
      case 'system':
        return t('sidebar.settings') || 'System';
      case 'cities':
        return t('sidebar.cities') || 'Cities';
      default:
        return '';
    }
  };

  return (
    <>
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

              {activeTab === 'calendar' && calendarSlot}

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

      <nav className="floating-dock-container" aria-label={t('sidebar.dockNavigation')}>
        <button
          type="button"
          className={`dock-item ${activeTab === 'filters' && !collapsed ? 'active' : ''}`}
          onClick={() => handleDockClick('filters')}
          aria-label={t('sidebar.openFilters')}
          title={t('sidebar.openFilters')}
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
          aria-label={t('sidebar.openPreview')}
          title={t('sidebar.openPreview')}
        >
          <span className="dock-tooltip">{t('preview.title')}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        <button
          type="button"
          className={`dock-item ${timelineOverlayEnabled ? 'active' : ''}`}
          onClick={onToggleTimelineOverlay}
          aria-label={t('sidebar.timelineTripToggle')}
          title={t('sidebar.timelineTripToggle')}
          aria-pressed={timelineOverlayEnabled}
        >
          <span className="dock-tooltip">{t('sidebar.timelineTripToggle')}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 19h20" />
            <path d="M3 16h7l9-9c.7-.7.7-1.9 0-2.6-.7-.7-1.9-.7-2.6 0l-9 9V6L4 4H3l1 6-2 2h1l2-1v5Z" />
          </svg>
        </button>

        <button
          type="button"
          className={`dock-item ${activeTab === 'system' && !collapsed ? 'active' : ''}`}
          onClick={() => handleDockClick('system')}
          aria-label={t('sidebar.openSystem')}
          title={t('sidebar.openSystem')}
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
          aria-label={t('sidebar.openCities')}
          title={t('sidebar.openCities')}
        >
          <span className="dock-tooltip">{t('sidebar.cities')}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4.3 8-11a8 8 0 1 0-16 0c0 6.7 8 11 8 11Z" />
            <circle cx="12" cy="11" r="2.5" />
          </svg>
        </button>

        <button
          type="button"
          className={`dock-item ${activeTab === 'calendar' && !collapsed ? 'active' : ''}`}
          onClick={() => handleDockClick('calendar')}
          aria-label={t('sidebar.openCalendar')}
          title={t('sidebar.openCalendar')}
        >
          <span className="dock-tooltip">{t('calendar.title')}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </nav>
    </>
  );
}
