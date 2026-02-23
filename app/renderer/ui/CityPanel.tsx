import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CityCatalogStatus, CityItem, ContinentItem, CountryItem } from '@shared/types/ipc';

import { DEFAULT_MAJOR_CITY_IDS } from '@renderer/cityDefaults';

const PAGE_SIZE = 100;

interface CityPanelProps {
  active: boolean;
  userFavoriteCityIds: string[];
  onChangeFavoriteCityIds: (ids: string[]) => Promise<void>;
  onFlyTo: (city: CityItem) => void;
}

function getCatalogStatusText(t: (key: string) => string, status: CityCatalogStatus | null): string {
  if (!status) {
    return t('cities.catalogIdle');
  }
  switch (status.phase) {
    case 'downloading':
      return t('cities.catalogDownloading');
    case 'importing':
      return t('cities.catalogImporting');
    case 'ready':
      return t('cities.catalogReady');
    case 'error':
      return t('cities.catalogError');
    default:
      return t('cities.catalogIdle');
  }
}

export function CityPanel({ active, userFavoriteCityIds, onChangeFavoriteCityIds, onFlyTo }: CityPanelProps) {
  const { t } = useTranslation();
  const [catalogStatus, setCatalogStatus] = useState<CityCatalogStatus | null>(null);
  const [continents, setContinents] = useState<ContinentItem[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [cities, setCities] = useState<CityItem[]>([]);
  const [favoriteCities, setFavoriteCities] = useState<CityItem[]>([]);
  const [selectedContinentCode, setSelectedContinentCode] = useState('');
  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [savingFavorites, setSavingFavorites] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const defaultFavoriteSet = useMemo(() => new Set(DEFAULT_MAJOR_CITY_IDS), []);
  const mergedFavoriteIds = useMemo(
    () => Array.from(new Set([...DEFAULT_MAJOR_CITY_IDS, ...userFavoriteCityIds])),
    [userFavoriteCityIds],
  );
  const userFavoriteSet = useMemo(() => new Set(userFavoriteCityIds), [userFavoriteCityIds]);

  const groupedFavorites = useMemo(() => {
    const groups = new Map<string, CityItem[]>();
    for (const city of favoriteCities) {
      const key = city.continentName;
      const group = groups.get(key);
      if (group) {
        group.push(city);
      } else {
        groups.set(key, [city]);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [favoriteCities]);

  const loadContinents = useCallback(async () => {
    const items = await window.photoGlobe.cities.getContinents();
    setContinents(items);
    if (items.length === 0) {
      setSelectedContinentCode('');
      return;
    }
    setSelectedContinentCode((current) => (current && items.some((item) => item.code === current) ? current : items[0].code));
  }, []);

  const ensureCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setErrorMessage(null);
    try {
      const status = await window.photoGlobe.cities.ensureCatalog();
      setCatalogStatus(status);
      if (status.phase === 'ready') {
        await loadContinents();
      } else if (status.phase === 'error') {
        setErrorMessage(status.message ?? t('cities.catalogError'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingCatalog(false);
    }
  }, [loadContinents, t]);

  const loadCountries = useCallback(async (continentCode: string) => {
    if (!continentCode) {
      setCountries([]);
      setSelectedCountryCode('');
      return;
    }
    setLoadingCountries(true);
    try {
      const next = await window.photoGlobe.cities.getCountries({ continentCode });
      setCountries(next);
      setSelectedCountryCode((current) => (current && next.some((item) => item.code === current) ? current : next[0]?.code ?? ''));
    } finally {
      setLoadingCountries(false);
    }
  }, []);

  const loadCities = useCallback(
    async (params: { reset: boolean; nextOffset: number }) => {
      if (!selectedContinentCode || !selectedCountryCode) {
        setCities([]);
        setOffset(0);
        setHasMore(false);
        return;
      }
      const seq = requestSeqRef.current + 1;
      requestSeqRef.current = seq;
      setLoadingCities(true);
      try {
        const rows = await window.photoGlobe.cities.getCities({
          continentCode: selectedContinentCode,
          countryCode: selectedCountryCode,
          query,
          limit: PAGE_SIZE,
          offset: params.nextOffset,
        });
        if (requestSeqRef.current !== seq) {
          return;
        }
        setHasMore(rows.length === PAGE_SIZE);
        setOffset(params.nextOffset);
        if (params.reset) {
          setCities(rows);
        } else {
          setCities((current) => {
            const existing = new Map(current.map((item) => [item.id, item]));
            for (const row of rows) {
              existing.set(row.id, row);
            }
            return Array.from(existing.values());
          });
        }
      } finally {
        if (requestSeqRef.current === seq) {
          setLoadingCities(false);
        }
      }
    },
    [query, selectedContinentCode, selectedCountryCode],
  );

  const loadFavoriteCities = useCallback(async () => {
    if (!active || mergedFavoriteIds.length === 0) {
      setFavoriteCities([]);
      return;
    }
    const rows = await window.photoGlobe.cities.getByIds({ ids: mergedFavoriteIds });
    setFavoriteCities(rows);
  }, [active, mergedFavoriteIds]);

  const handleToggleFavorite = useCallback(
    async (cityId: string) => {
      if (defaultFavoriteSet.has(cityId)) {
        return;
      }
      setSavingFavorites(true);
      try {
        const nextSet = new Set(userFavoriteCityIds);
        if (nextSet.has(cityId)) {
          nextSet.delete(cityId);
        } else {
          nextSet.add(cityId);
        }
        await onChangeFavoriteCityIds(Array.from(nextSet));
      } finally {
        setSavingFavorites(false);
      }
    },
    [defaultFavoriteSet, onChangeFavoriteCityIds, userFavoriteCityIds],
  );

  useEffect(() => {
    const unsubscribe = window.photoGlobe.cities.onCatalogProgress((progress) => {
      setCatalogStatus(progress);
      if (progress.phase === 'error') {
        setErrorMessage(progress.message ?? t('cities.catalogError'));
      }
      if (progress.phase === 'ready') {
        setErrorMessage(null);
        void loadContinents();
      }
    });
    return unsubscribe;
  }, [loadContinents, t]);

  useEffect(() => {
    if (!active) {
      return;
    }
    if (catalogStatus?.phase === 'ready') {
      void loadContinents();
      return;
    }
    void ensureCatalog();
  }, [active, catalogStatus?.phase, ensureCatalog, loadContinents]);

  useEffect(() => {
    if (!active || catalogStatus?.phase !== 'ready') {
      return;
    }
    void loadCountries(selectedContinentCode);
  }, [active, catalogStatus?.phase, loadCountries, selectedContinentCode]);

  useEffect(() => {
    if (!active || catalogStatus?.phase !== 'ready') {
      return;
    }
    const timer = window.setTimeout(() => {
      void loadCities({ reset: true, nextOffset: 0 });
    }, 180);
    return () => {
      window.clearTimeout(timer);
    };
  }, [active, catalogStatus?.phase, loadCities, query, selectedCountryCode, selectedContinentCode]);

  useEffect(() => {
    if (catalogStatus?.phase !== 'ready') {
      return;
    }
    void loadFavoriteCities();
  }, [catalogStatus?.phase, loadFavoriteCities, mergedFavoriteIds]);

  return (
    <div className="city-panel">
      <section className="panel city-status-card">
        <h3>{t('cities.catalogTitle')}</h3>
        <p className="status-text">
          {getCatalogStatusText(t, catalogStatus)} {catalogStatus ? `(${Math.floor(catalogStatus.percent)}%)` : ''}
        </p>
        {catalogStatus?.rowCount ? (
          <p className="status-text">
            {t('cities.catalogRows')}: {catalogStatus.rowCount.toLocaleString()}
          </p>
        ) : null}
        {errorMessage ? <p className="status-text status-text-error">{errorMessage}</p> : null}
        <button type="button" onClick={() => void ensureCatalog()} disabled={loadingCatalog}>
          {loadingCatalog ? t('cities.catalogLoading') : t('cities.catalogRetry')}
        </button>
      </section>

      <section className="panel city-favorites-card">
        <h3>{t('cities.favorites')}</h3>
        {groupedFavorites.length === 0 ? (
          <p className="status-text">{t('cities.noFavorites')}</p>
        ) : (
          groupedFavorites.map(([continentName, rows]) => (
            <div key={continentName} className="city-favorite-group">
              <strong>{continentName}</strong>
              <div className="city-chip-list">
                {rows.map((city) => (
                  <button
                    key={city.id}
                    type="button"
                    className="city-chip-btn"
                    onClick={() => onFlyTo(city)}
                    title={`${city.countryName} (${city.lat.toFixed(4)}, ${city.lng.toFixed(4)})`}
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </div>
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
              onChange={(event) => setSelectedContinentCode(event.target.value)}
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
              onChange={(event) => setSelectedCountryCode(event.target.value)}
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('cities.searchPlaceholder')}
            disabled={catalogStatus?.phase !== 'ready'}
          />
        </label>

        <div className="city-list">
          {cities.map((city) => {
            const isDefault = defaultFavoriteSet.has(city.id);
            const isUserFavorite = userFavoriteSet.has(city.id);
            const isFavorite = isDefault || isUserFavorite;
            return (
              <button
                key={city.id}
                type="button"
                className="city-list-item"
                onClick={() => onFlyTo(city)}
                title={`${city.countryName} (${city.lat.toFixed(4)}, ${city.lng.toFixed(4)})`}
              >
                <span className="city-list-main">
                  <strong>{city.name}</strong>
                  <small>{city.countryName}</small>
                </span>
                <span className="city-list-actions">
                  <small>{city.population.toLocaleString()}</small>
                  <span
                    role="button"
                    aria-label={isFavorite ? t('cities.unfavorite') : t('cities.favorite')}
                    className={`city-star${isFavorite ? ' is-active' : ''}${isDefault ? ' is-default' : ''}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void handleToggleFavorite(city.id);
                    }}
                  >
                    {isFavorite ? '\u2605' : '\u2606'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {loadingCities ? <p className="status-text">{t('cities.loadingCities')}</p> : null}
        {!loadingCities && hasMore ? (
          <button type="button" onClick={() => void loadCities({ reset: false, nextOffset: offset + PAGE_SIZE })}>
            {t('cities.loadMore')}
          </button>
        ) : null}
        {savingFavorites ? <p className="status-text">{t('cities.savingFavorites')}</p> : null}
      </section>
    </div>
  );
}
