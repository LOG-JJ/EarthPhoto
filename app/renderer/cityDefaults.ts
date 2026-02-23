export const DEFAULT_MAJOR_CITY_IDS_BY_CONTINENT: Record<string, string[]> = {
  AS: [
    '1853909', // Osaka
    '1835848', // Seoul
    '1838524', // Busan
    '1850147', // Tokyo
    '1816670', // Beijing
    '1796236', // Shanghai
    '1880252', // Singapore
    '1609350', // Bangkok
    '1819729', // Hong Kong
    '1668341', // Taipei
    '1642911', // Jakarta
    '1273294', // Delhi
  ],
  EU: [
    '2643743', // London
    '2988507', // Paris
    '2950159', // Berlin
    '3169070', // Rome
    '3117735', // Madrid
    '2759794', // Amsterdam
    '2761369', // Vienna
    '3067696', // Prague
    '524901', // Moscow
  ],
  NA: [
    '5128581', // New York
    '5368361', // Los Angeles
    '5391959', // San Francisco
    '4887398', // Chicago
    '6167865', // Toronto
    '6173331', // Vancouver
    '3530597', // Mexico City
  ],
  SA: [
    '3448439', // Sao Paulo
    '3451190', // Rio de Janeiro
    '3435910', // Buenos Aires
    '3871336', // Santiago
    '3936456', // Lima
    '3688689', // Bogota
  ],
  AF: [
    '360630', // Cairo
    '993800', // Johannesburg
    '3369157', // Cape Town
    '184745', // Nairobi
    '2332459', // Lagos
    '2553604', // Casablanca
  ],
  OC: [
    '2147714', // Sydney
    '2158177', // Melbourne
    '2174003', // Brisbane
    '2063523', // Perth
    '2193733', // Auckland
  ],
};

export const DEFAULT_MAJOR_CITY_IDS = Array.from(
  new Set(Object.values(DEFAULT_MAJOR_CITY_IDS_BY_CONTINENT).flat()),
);
