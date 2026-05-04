export type RegionValue = {
  country?: string | null;
  city?: string | null;
};

type RegionCatalogEntry = {
  country: string;
  cities: readonly string[];
};

export const REGION_CATALOG: readonly RegionCatalogEntry[] = [
  {
    country: "China",
    cities: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Hangzhou"],
  },
  {
    country: "Japan",
    cities: ["Tokyo", "Osaka", "Kyoto", "Nagoya", "Fukuoka"],
  },
  {
    country: "South Korea",
    cities: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon"],
  },
  {
    country: "United States",
    cities: ["New York", "San Francisco", "Los Angeles", "Chicago", "Seattle"],
  },
  {
    country: "Canada",
    cities: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"],
  },
  {
    country: "United Kingdom",
    cities: ["London", "Manchester", "Birmingham", "Edinburgh", "Glasgow"],
  },
  {
    country: "Australia",
    cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
  },
  {
    country: "Germany",
    cities: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne"],
  },
  {
    country: "France",
    cities: ["Paris", "Lyon", "Marseille", "Toulouse", "Nice"],
  },
  {
    country: "India",
    cities: ["Delhi", "Mumbai", "Bangalore", "Hyderabad", "Chennai"],
  },
] as const;

const normalizeRegionPart = (value?: string | null) =>
  typeof value === "string" ? value.trim() : "";

export const formatRegion = (country?: string | null, city?: string | null) => {
  const normalizedCountry = normalizeRegionPart(country);
  const normalizedCity = normalizeRegionPart(city);

  if (normalizedCountry && normalizedCity) {
    return `${normalizedCountry}, ${normalizedCity}`;
  }

  if (normalizedCountry) {
    return normalizedCountry;
  }

  if (normalizedCity) {
    return normalizedCity;
  }

  return null;
};

export const getRegionCountries = () =>
  REGION_CATALOG.map((entry) => entry.country);

export const getRegionCitiesForCountry = (country: string) => {
  const normalizedCountry = country.trim();
  const entry = REGION_CATALOG.find(
    (item) => item.country === normalizedCountry,
  );
  return entry?.cities ?? [];
};

export const mergeSelectOptions = (
  currentValue: string,
  options: readonly string[],
) => {
  const normalized = currentValue.trim();
  if (!normalized) {
    return [...options];
  }
  return options.includes(normalized) ? [...options] : [normalized, ...options];
};
