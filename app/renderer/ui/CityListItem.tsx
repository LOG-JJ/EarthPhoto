import type { CityItem } from '@shared/types/ipc';

interface CityListItemProps {
  city: CityItem;
  isFavorite: boolean;
  isDefault: boolean;
  onFlyTo: (city: CityItem) => void;
  onToggleFavorite: (cityId: string) => void;
  favoriteLabel: string;
  unfavoriteLabel: string;
}

export function CityListItem({
  city,
  isFavorite,
  isDefault,
  onFlyTo,
  onToggleFavorite,
  favoriteLabel,
  unfavoriteLabel,
}: CityListItemProps) {
  return (
    <button
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
          tabIndex={0}
          aria-label={isFavorite ? unfavoriteLabel : favoriteLabel}
          aria-pressed={isFavorite}
          className={`city-star${isFavorite ? ' is-active' : ''}${isDefault ? ' is-default' : ''}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite(city.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onToggleFavorite(city.id);
            }
          }}
        >
          {isFavorite ? '\u2605' : '\u2606'}
        </span>
      </span>
    </button>
  );
}
