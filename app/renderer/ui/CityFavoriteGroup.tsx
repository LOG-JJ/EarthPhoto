import type { CityItem } from '@shared/types/ipc';

interface CityFavoriteGroupProps {
  continentName: string;
  cities: CityItem[];
  onFlyTo: (city: CityItem) => void;
}

export function CityFavoriteGroup({ continentName, cities, onFlyTo }: CityFavoriteGroupProps) {
  return (
    <div className="city-favorite-group">
      <strong>{continentName}</strong>
      <div className="city-chip-list">
        {cities.map((city) => (
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
  );
}
