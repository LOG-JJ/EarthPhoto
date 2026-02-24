import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { CityCatalogStatus } from '@shared/types/ipc';

import { DEFAULT_MAJOR_CITY_IDS } from '@renderer/cityDefaults';
import {
  CITY_PAGE_SIZE,
  groupCitiesByContinent,
  mergeFavoriteCityIds,
} from '@renderer/domain/city/cityRules';
import type { PhotoGlobeGateway } from '@renderer/infrastructure/photoGlobeGateway';
import { windowPhotoGlobeGateway } from '@renderer/infrastructure/windowPhotoGlobeGateway';
import { useAppStore } from '@renderer/store/useAppStore';

interface UseCityCatalogUseCaseParams {
  active: boolean;
  userFavoriteCityIds: string[];
  onChangeFavoriteCityIds: (ids: string[]) => Promise<void>;
  gateway?: PhotoGlobeGateway;
}

function getCatalogStatusText(t: (key: string) => string, status: CityCatalogStatus | null): string {
  if (!status) return t('cities.catalogIdle');
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

export function useCityCatalogUseCase({
  active,
  userFavoriteCityIds,
  onChangeFavoriteCityIds,
  gateway = windowPhotoGlobeGateway,
}: UseCityCatalogUseCaseParams) {
  const catalogStatus = useAppStore((state) => state.catalogStatus);
  const setCatalogStatus = useAppStore((state) => state.setCatalogStatus);
  const continents = useAppStore((state) => state.continents);
  const setContinents = useAppStore((state) => state.setContinents);
  const countries = useAppStore((state) => state.countries);
  const setCountries = useAppStore((state) => state.setCountries);
  const cities = useAppStore((state) => state.cities);
  const setCities = useAppStore((state) => state.setCities);
  const favoriteCities = useAppStore((state) => state.favoriteCities);
  const setFavoriteCities = useAppStore((state) => state.setFavoriteCities);
  const selectedContinentCode = useAppStore((state) => state.selectedContinentCode);
  const setSelectedContinentCode = useAppStore((state) => state.setSelectedContinentCode);
  const selectedCountryCode = useAppStore((state) => state.selectedCountryCode);
  const setSelectedCountryCode = useAppStore((state) => state.setSelectedCountryCode);
  const query = useAppStore((state) => state.query);
  const setQuery = useAppStore((state) => state.setQuery);
  const offset = useAppStore((state) => state.offset);
  const setOffset = useAppStore((state) => state.setOffset);
  const hasMore = useAppStore((state) => state.hasMore);
  const setHasMore = useAppStore((state) => state.setHasMore);
  const loadingCatalog = useAppStore((state) => state.loadingCatalog);
  const setLoadingCatalog = useAppStore((state) => state.setLoadingCatalog);
  const loadingCountries = useAppStore((state) => state.loadingCountries);
  const setLoadingCountries = useAppStore((state) => state.setLoadingCountries);
  const loadingCities = useAppStore((state) => state.loadingCities);
  const setLoadingCities = useAppStore((state) => state.setLoadingCities);
  const savingFavorites = useAppStore((state) => state.savingFavorites);
  const setSavingFavorites = useAppStore((state) => state.setSavingFavorites);
  const errorMessage = useAppStore((state) => state.errorMessage);
  const setErrorMessage = useAppStore((state) => state.setErrorMessage);

  const requestSeqRef = useRef(0);

  const defaultFavoriteSet = useMemo(() => new Set(DEFAULT_MAJOR_CITY_IDS), []);
  const mergedFavoriteIds = useMemo(
    () => mergeFavoriteCityIds(DEFAULT_MAJOR_CITY_IDS, userFavoriteCityIds),
    [userFavoriteCityIds],
  );
  const userFavoriteSet = useMemo(() => new Set(userFavoriteCityIds), [userFavoriteCityIds]);

  const groupedFavorites = useMemo(() => groupCitiesByContinent(favoriteCities), [favoriteCities]);

  const loadContinents = useCallback(async () => {
    const items = await gateway.citiesGetContinents();
    setContinents(items);
    if (items.length === 0) {
      setSelectedContinentCode('');
      return;
    }
    setSelectedContinentCode((current) =>
      current && items.some((item) => item.code === current) ? current : items[0].code,
    );
  }, [gateway, setContinents, setSelectedContinentCode]);

  const ensureCatalog = useCallback(
    async (t: (key: string) => string) => {
      setLoadingCatalog(true);
      setErrorMessage(null);
      try {
        const status = await gateway.citiesEnsureCatalog();
        setCatalogStatus(status);
        if (status.phase === 'ready') await loadContinents();
        else if (status.phase === 'error') setErrorMessage(status.message ?? t('cities.catalogError'));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setLoadingCatalog(false);
      }
    },
    [gateway, loadContinents, setCatalogStatus, setErrorMessage, setLoadingCatalog],
  );

  const loadCountries = useCallback(
    async (continentCode: string) => {
      if (!continentCode) {
        setCountries([]);
        setSelectedCountryCode('');
        return;
      }
      setLoadingCountries(true);
      try {
        const next = await gateway.citiesGetCountries({ continentCode });
        setCountries(next);
        setSelectedCountryCode((current) =>
          current && next.some((item) => item.code === current) ? current : (next[0]?.code ?? ''),
        );
      } finally {
        setLoadingCountries(false);
      }
    },
    [gateway, setCountries, setLoadingCountries, setSelectedCountryCode],
  );

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
        const rows = await gateway.citiesGetCities({
          continentCode: selectedContinentCode,
          countryCode: selectedCountryCode,
          query,
          limit: CITY_PAGE_SIZE,
          offset: params.nextOffset,
        });
        if (requestSeqRef.current !== seq) return;
        setHasMore(rows.length === CITY_PAGE_SIZE);
        setOffset(params.nextOffset);
        if (params.reset) {
          setCities(rows);
        } else {
          setCities((current) => {
            const existing = new Map(current.map((item) => [item.id, item]));
            for (const row of rows) existing.set(row.id, row);
            return Array.from(existing.values());
          });
        }
      } finally {
        if (requestSeqRef.current === seq) setLoadingCities(false);
      }
    },
    [
      gateway,
      query,
      selectedContinentCode,
      selectedCountryCode,
      setCities,
      setHasMore,
      setLoadingCities,
      setOffset,
    ],
  );

  const loadFavoriteCities = useCallback(async () => {
    if (!active || mergedFavoriteIds.length === 0) {
      setFavoriteCities([]);
      return;
    }
    const rows = await gateway.citiesGetByIds({ ids: mergedFavoriteIds });
    setFavoriteCities(rows);
  }, [active, gateway, mergedFavoriteIds, setFavoriteCities]);

  const handleToggleFavorite = useCallback(async (cityId: string) => {
    if (defaultFavoriteSet.has(cityId)) return;
    setSavingFavorites(true);
    try {
      const nextSet = new Set(userFavoriteCityIds);
      if (nextSet.has(cityId)) nextSet.delete(cityId);
      else nextSet.add(cityId);
      await onChangeFavoriteCityIds(Array.from(nextSet));
    } finally {
      setSavingFavorites(false);
    }
  }, [defaultFavoriteSet, onChangeFavoriteCityIds, setSavingFavorites, userFavoriteCityIds]);

  const subscribeCatalogProgress = useCallback(
    (t: (key: string) => string) => {
      return gateway.citiesOnCatalogProgress((progress) => {
        setCatalogStatus(progress);
        if (progress.phase === 'error') setErrorMessage(progress.message ?? t('cities.catalogError'));
        if (progress.phase === 'ready') {
          setErrorMessage(null);
          void loadContinents();
        }
      });
    },
    [gateway, loadContinents, setCatalogStatus, setErrorMessage],
  );

  useEffect(() => {
    if (!active || catalogStatus?.phase !== 'ready') return;
    void loadCountries(selectedContinentCode);
  }, [active, catalogStatus?.phase, loadCountries, selectedContinentCode]);

  useEffect(() => {
    if (!active || catalogStatus?.phase !== 'ready') return;
    const timer = window.setTimeout(() => void loadCities({ reset: true, nextOffset: 0 }), 180);
    return () => window.clearTimeout(timer);
  }, [active, catalogStatus?.phase, loadCities, query, selectedCountryCode, selectedContinentCode]);

  useEffect(() => {
    if (catalogStatus?.phase === 'ready') void loadFavoriteCities();
  }, [catalogStatus?.phase, loadFavoriteCities, mergedFavoriteIds]);

  return {
    catalogStatus,
    continents,
    countries,
    cities,
    groupedFavorites,
    selectedContinentCode,
    selectedCountryCode,
    query,
    offset,
    hasMore,
    loadingCatalog,
    loadingCountries,
    loadingCities,
    savingFavorites,
    errorMessage,
    defaultFavoriteSet,
    userFavoriteSet,
    getCatalogStatusText,
    ensureCatalog,
    loadContinents,
    loadCities,
    loadCountries,
    handleToggleFavorite,
    subscribeCatalogProgress,
    setSelectedContinentCode,
    setSelectedCountryCode,
    setQuery,
  };
}
