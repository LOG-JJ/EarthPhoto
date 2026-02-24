# Apple x Toss UX Expansion Release Notes

## Scope
- Metrics pipeline with local session storage and fail-open behavior
- Journey Coach first-run overlay with persisted onboarding state
- Timeline Story v1 marker + active trip card synchronization
- Trip Cards panel with quick focus and representative media open
- Feature flags for staged rollout
- UI theme presets persisted in settings

## Feature Flags (default)
- `journeyCoachV1: true`
- `timelineStoryV1: false`
- `tripCardsV1: false`
- `metricsPanelV1: true`

## KPI Instrumentation
- Implemented funnel events:
  - `app_opened`
  - `first_data_visible`
  - `point_or_cluster_clicked`
  - `timeline_opened`
  - `trip_enabled` (or playback proxy)
  - `playback_started`
  - `source_opened`
  - `index_started`
  - `index_completed`
  - `index_failed`
- Session retention: latest 30 sessions
- Export: JSON file under app data metrics exports folder

## Rollout Checklist
1. Confirm `npm run typecheck` and `npm run build` pass on release branch.
2. Start with `timelineStoryV1=false`, `tripCardsV1=false`.
3. Enable `timelineStoryV1` for internal validation cohort.
4. Verify timeline marker highlight and trip polyline sync during playback.
5. Enable `tripCardsV1` for internal validation cohort.
6. Verify trip card click-to-focus latency under 1s on representative datasets.
7. Validate metrics panel export and reset behavior with no app crash impact.
8. Confirm fallback behavior when metrics file is missing/corrupted.
9. Confirm thumbnail and hover preview failure paths degrade gracefully.
10. Publish release notes and keep flags reversible for rollback.

## Post-Release Monitoring
- Track session funnel completion trend vs baseline.
- Watch first-data-visible p50 and first-interaction p50.
- Keep flag rollback ready if interaction latency regresses.
