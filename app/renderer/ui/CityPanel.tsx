import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CityCatalogStatus, CityItem, ContinentItem, CountryItem } from '@shared/types/ipc';

import { CityFavoriteGroup } from './CityFavoriteGroup';
import { CityListItem } from './CityListItem';

interface CityPanelProps {
  catalogStatus: CityCatalogStatus | null;
  catalogStatusText: string;
  continents: ContinentItem[];
  countries: CountryItem[];
  cities: CityItem[];
  groupedFavorites: Array<[string, CityItem[]]>;
  selectedContinentCode: string;
  selectedCountryCode: string;
  query: string;
  hasMore: boolean;
  loadingCatalog: boolean;
  loadingCountries: boolean;
  loadingCities: boolean;
  savingFavorites: boolean;
  errorMessage: string | null;
  isFavorite: (cityId: string) => boolean;
  isDefaultFavorite: (cityId: string) => boolean;
  onRetryCatalog: () => void;
  onSelectContinent: (code: string) => void;
  onSelectCountry: (code: string) => void;
  onQueryChange: (query: string) => void;
  onLoadMore: () => void;
  onToggleFavorite: (cityId: string) => void;
  onFlyTo: (city: CityItem) => void;
}

const CITY_ROW_HEIGHT = 66;
const CITY_LIST_FALLBACK_HEIGHT = 320;
const CITY_OVERSCAN = 8;

export function CityPanel({
  catalogStatus,
  catalogStatusText,
  continents,
  countries,
  cities,
  groupedFavorites,
  selectedContinentCode,
  selectedCountryCode,
  query,
  hasMore,
  loadingCatalog,
  loadingCountries,
  loadingCities,
  savingFavorites,
  errorMessage,
  isFavorite,
  isDefaultFavorite,
  onRetryCatalog,
  onSelectContinent,
  onSelectCountry,
  onQueryChange,
  onLoadMore,
  onToggleFavorite,
  onFlyTo,
}: CityPanelProps) {
  const { t } = useTranslation();
  const cityListRef = useRef<HTMLDivElement | null>(null);
  const [cityScrollTop, setCityScrollTop] = useState(0);
  const [cityViewportHeight, setCityViewportHeight] = useState(CITY_LIST_FALLBACK_HEIGHT);

  useEffect(() => {
    const node = cityListRef.current;
    if (!node) {
      return;
    }

    const syncViewportHeight = () => {
      const nextHeight = node.clientHeight || CITY_LIST_FALLBACK_HEIGHT;
      setCityViewportHeight(nextHeight);
    };
    syncViewportHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(syncViewportHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = cityListRef.current;
    if (!node) {
      return;
    }
    const maxScrollTop = Math.max(0, cities.length * CITY_ROW_HEIGHT - node.clientHeight);
    if (node.scrollTop > maxScrollTop) {
      node.scrollTop = maxScrollTop;
      setCityScrollTop(maxScrollTop);
    }
  }, [cities.length]);

  const virtualRange = useMemo(() => {
    const itemCount = cities.length;
    if (itemCount === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        totalHeight: 0,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        visibleCities: [] as CityItem[],
      };
    }

    const totalHeight = itemCount * CITY_ROW_HEIGHT;
    const visibleCount = Math.max(1, Math.ceil(cityViewportHeight / CITY_ROW_HEIGHT) + CITY_OVERSCAN * 2);
    const startIndex = Math.max(0, Math.floor(cityScrollTop / CITY_ROW_HEIGHT) - CITY_OVERSCAN);
    const endIndex = Math.min(itemCount, startIndex + visibleCount);
    const topSpacerHeight = startIndex * CITY_ROW_HEIGHT;
    const bottomSpacerHeight = Math.max(0, totalHeight - endIndex * CITY_ROW_HEIGHT);
    const visibleCities = cities.slice(startIndex, endIndex);

    return {
      startIndex,
      endIndex,
      totalHeight,
      topSpacerHeight,
      bottomSpacerHeight,
      visibleCities,
    };
  }, [cities, cityScrollTop, cityViewportHeight]);

  return (
    <div className="city-panel">
      <section className="panel city-status-card">
        <h3>{t('cities.catalogTitle')}</h3>
        <p className="status-text">
          {catalogStatusText} {catalogStatus ? `(${Math.floor(catalogStatus.percent)}%)` : ''}
        </p>
        {catalogStatus?.rowCount ? (
          <p className="status-text">{t('cities.catalogRows')}: {catalogStatus.rowCount.toLocaleString()}</p>
        ) : null}
        {errorMessage ? <p className="status-text status-text-error">{errorMessage}</p> : null}
        <button type="button" onClick={onRetryCatalog} disabled={loadingCatalog}>
          {loadingCatalog ? t('cities.catalogLoading') : t('cities.catalogRetry')}
        </button>
      </section>

      <section className="panel city-favorites-card">
        <h3>{t('cities.favorites')}</h3>
        {groupedFavorites.length === 0 ? (
          <p className="status-text">{t('cities.noFavorites')}</p>
        ) : (
          groupedFavorites.map(([continentName, rows]) => (
            <CityFavoriteGroup key={continentName} continentName={continentName} cities={rows} onFlyTo={onFlyTo} />
          ))
        )}
      </section>

      <section className="panel">
        <h3>{t('cities.explore')}</h3>
        <div className="city-select-row">
          <label>
            {t('cities.continent')}
            <select
              value={selectedContinentCode}
              onChange={(event) => onSelectContinent(event.target.value)}
              disabled={catalogStatus?.phase !== 'ready'}
            >
              {continents.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} ({item.cityCount.toLocaleString()})
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('cities.country')}
            <select
              value={selectedCountryCode}
              onChange={(event) => onSelectCountry(event.target.value)}
              disabled={catalogStatus?.phase !== 'ready' || loadingCountries}
            >
              {countries.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} ({item.cityCount.toLocaleString()})
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          {t('cities.city')}
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('cities.searchPlaceholder')}
            disabled={catalogStatus?.phase !== 'ready'}
          />
        </label>

        <div
          className="city-list"
          ref={cityListRef}
          onScroll={(event) => setCityScrollTop(event.currentTarget.scrollTop)}
        >
          {cities.length === 0 && !loadingCities ? (
            <p className="empty-state">{t('cities.noCities')}</p>
          ) : (
            <div className="city-list-canvas" style={{ height: virtualRange.totalHeight }}>
              <div style={{ height: virtualRange.topSpacerHeight }} />
              {virtualRange.visibleCities.map((city) => {
                const isDefault = isDefaultFavorite(city.id);
                return (
                  <div key={city.id} className="city-list-row">
                    <CityListItem
                      city={city}
                      isFavorite={isFavorite(city.id)}
                      isDefault={isDefault}
                      onFlyTo={onFlyTo}
                      onToggleFavorite={onToggleFavorite}
                      favoriteLabel={t('cities.favorite')}
                      unfavoriteLabel={t('cities.unfavorite')}
                    />
                  </div>
                );
              })}
              <div style={{ height: virtualRange.bottomSpacerHeight }} />
            </div>
          )}
        </div>
        {loadingCities ? <p className="status-text">{t('cities.loadingCities')}</p> : null}
        {!loadingCities && hasMore ? (
          <button type="button" onClick={onLoadMore}>
            {t('cities.loadMore')}
          </button>
        ) : null}
        {savingFavorites ? <p className="status-text">{t('cities.savingFavorites')}</p> : null}
      </section>
    </div>
  );
}
