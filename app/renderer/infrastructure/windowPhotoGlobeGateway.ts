import i18n from '@renderer/i18n';

import type { PhotoGlobeGateway } from './photoGlobeGateway';

function getApi() {
  if (typeof window.photoGlobe === 'undefined') {
    throw new Error('Renderer API is not available yet');
  }
  return window.photoGlobe;
}

export const windowPhotoGlobeGateway: PhotoGlobeGateway = {
  isAvailable: () => typeof window.photoGlobe !== 'undefined',
  reloadWindow: () => window.location.reload(),

  appSelectFolder: () => getApi().app.selectFolder(),
  appToggleFullscreen: () => getApi().app.toggleFullscreen(),
  appGetWindowState: () => getApi().app.getWindowState(),

  indexStart: (payload) => getApi().index.start(payload),
  indexCancel: (payload) => getApi().index.cancel(payload),
  indexStatus: (jobId) => getApi().index.status(jobId),
  indexOnProgress: (listener) => getApi().index.onProgress(listener),

  geoGetClusters: (payload) => getApi().geo.getClusters(payload),
  geoGetClusterMembers: (payload) => getApi().geo.getClusterMembers(payload),
  geoGetTrips: (payload) => getApi().geo.getTrips(payload),

  mediaGetThumbnail: (payload) => getApi().media.getThumbnail(payload),
  mediaRequestPreviewStrip: (payload) => getApi().media.requestPreviewStrip(payload),
  mediaCancelPreviewStrip: (payload) => getApi().media.cancelPreviewStrip(payload),
  mediaOnPreviewStripProgress: (listener) => getApi().media.onPreviewStripProgress(listener),
  mediaPrefetchThumbnails: (payload) => getApi().media.prefetchThumbnails(payload),
  mediaCountPrefetchTargets: (payload) => getApi().media.countPrefetchTargets(payload),
  mediaGetPrefetchTargetIds: (payload) => getApi().media.getPrefetchTargetIds(payload),
  mediaGetHoverPreview: (payload) => getApi().media.getHoverPreview(payload),
  mediaGetDailyCounts: (payload) => getApi().media.getDailyCounts(payload),
  mediaGetTimelineExtent: (payload) => getApi().media.getTimelineExtent(payload),
  mediaGetSource: (payload) => getApi().media.getSource(payload),
  mediaOpenSource: (payload) => getApi().media.openSource(payload),

  settingsGet: () => getApi().settings.get(),
  settingsSet: (payload) => getApi().settings.set(payload),
  settingsAddRecentRoot: (payload) => getApi().settings.addRecentRoot(payload),
  settingsAddRoot: (payload) => getApi().settings.addRoot(payload),
  settingsRemoveRoot: (payload) => getApi().settings.removeRoot(payload),
  settingsSetActiveRoots: (payload) => getApi().settings.setActiveRoots(payload),
  settingsListRoots: () => getApi().settings.listRoots(),
  metricsTrack: (payload) => getApi().metrics.track(payload),
  metricsGetSessionSummary: () => getApi().metrics.getSessionSummary(),
  metricsListRecentSessions: (payload) => getApi().metrics.listRecentSessions(payload),
  metricsExportRecentSessions: (payload) => getApi().metrics.exportRecentSessions(payload),
  metricsResetCurrentSession: () => getApi().metrics.resetCurrentSession(),

  citiesEnsureCatalog: () => getApi().cities.ensureCatalog(),
  citiesGetContinents: () => getApi().cities.getContinents(),
  citiesGetCountries: (payload) => getApi().cities.getCountries(payload),
  citiesGetCities: (payload) => getApi().cities.getCities(payload),
  citiesGetByIds: (payload) => getApi().cities.getByIds(payload),
  citiesOnCatalogProgress: (listener) => getApi().cities.onCatalogProgress(listener),

  i18nChangeLanguage: async (language) => {
    await i18n.changeLanguage(language);
  },
};
