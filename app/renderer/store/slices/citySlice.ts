import type { StateCreator } from 'zustand';

import type { AppStore, CitySlice } from '../types';

export const createCitySlice: StateCreator<AppStore, [], [], CitySlice> = (set) => ({
  catalogStatus: null,
  setCatalogStatus: (status) => set({ catalogStatus: status }),

  continents: [],
  setContinents: (items) => set({ continents: items }),

  countries: [],
  setCountries: (items) => set({ countries: items }),

  cities: [],
  setCities: (updater) =>
    set((state) => ({
      cities: typeof updater === 'function' ? updater(state.cities) : updater,
    })),

  favoriteCities: [],
  setFavoriteCities: (items) => set({ favoriteCities: items }),

  selectedContinentCode: '',
  setSelectedContinentCode: (updater) =>
    set((state) => ({
      selectedContinentCode:
        typeof updater === 'function' ? updater(state.selectedContinentCode) : updater,
    })),

  selectedCountryCode: '',
  setSelectedCountryCode: (updater) =>
    set((state) => ({
      selectedCountryCode: typeof updater === 'function' ? updater(state.selectedCountryCode) : updater,
    })),

  query: '',
  setQuery: (value) => set({ query: value }),

  offset: 0,
  setOffset: (value) => set({ offset: value }),

  hasMore: false,
  setHasMore: (value) => set({ hasMore: value }),

  loadingCatalog: false,
  setLoadingCatalog: (value) => set({ loadingCatalog: value }),

  loadingCountries: false,
  setLoadingCountries: (value) => set({ loadingCountries: value }),

  loadingCities: false,
  setLoadingCities: (value) => set({ loadingCities: value }),

  savingFavorites: false,
  setSavingFavorites: (value) => set({ savingFavorites: value }),

  errorMessage: null,
  setErrorMessage: (value) => set({ errorMessage: value }),
});
