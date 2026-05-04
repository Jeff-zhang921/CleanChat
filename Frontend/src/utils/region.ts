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
    cities: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Hangzhou", "Chengdu", "Wuhan", "Xi'an", "Nanjing", "Tianjin", "Changsha", "Qingdao", "Dalian", "Zhengzhou", "Shenyang", "Kunming", "Harbin", "Fuzhou", "Xiamen", "Jinan", "Ningbo", "Changchun", "Urumqi", "Taiyuan", "Hefei", "Shijiazhuang", "Yantai"],
  },
  {
    country: "Singapore",
    cities: [""],
  },
  {
country: "Malaysia",
cities: ["Kuala Lumpur", "George Town", "Johor Bahru", "Ipoh", "Shah Alam", "Petaling Jaya", "Kota Kinabalu", "Kuching", "Alor Setar", "Seremban", "Melaka City", "Kangar", "Taiping", "Kangar", "Sibu"],
  },


  {
    country: "Taiwan",
    cities: ["Taipei", "Kaohsiung", "Taichung", "Tainan", "Hsinchu", "Keelung", "Chiayi", "Miaoli", "Yilan", "Pingtung"],
  },
  {
    country: "Hong Kong",
    cities: ["kowloon", "new territories", "hong kong island", "lantau island"],
  },
  {
    country: "Macau",
    cities: [""],
  },

  {
    country: "Japan",
    cities: ["Tokyo", "Osaka", "Kyoto", "Nagoya", "Fukuoka", "Sapporo", "Hiroshima", "Sendai", "Yokohama", "Kobe", "Nara", "Kanazawa", "Okinawa", "Matsumoto", "Hakone"],
  },
  {
    country: "South Korea",
    cities: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Suwon", "Ulsan", "Changwon", "Seongnam", "Goyang", "Yongin", "Jeonju", "Cheongju", "Gangneung"],
  },
  {
    country: "United States",
    cities: ["New York", "San Francisco", "Los Angeles", "Chicago", "Seattle", "Boston", "Washington D.C.", "Miami", "Austin", "Denver", "Atlanta", "Portland", "Las Vegas", "Philadelphia", "Dallas", "San Diego", "Orlando", "Minneapolis", "Detroit", "Baltimore", "Charlotte", "Columbus", "Indianapolis", "San Jose", "Nashville", "Raleigh"],
  },
  {
    country: "Canada",
    cities: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa", "Edmonton", "Winnipeg", "Quebec City", "Hamilton", "Kitchener", "Halifax", "Victoria", "Saskatoon", "Regina", "St. John's"],
  },
  {
    country: "United Kingdom",
    cities: ["London", "Manchester", "Birmingham", "Edinburgh", "Glasgow", "Liverpool", "Bristol city", "Leeds", "Sheffield", "Cardiff", "Coventry", "Nottingham", "Southampton", "York", "Brighton", "Reading", "Belfast", "Newcastle", "Sunderland", "Norfolk", "Plymouth", "Derby", "Dundee", "Aberdeen", "Swansea", "Exeter"],
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
    cities: ["Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes", "Strasbourg", "Montpellier", "Bordeaux", "Lille", "Rennes", "Reims", "Le Havre", "Saint-Étienne", "Toulon", "Grenoble", "Dijon", "Angers", "Villeurbanne", "Clermont-Ferrand"],
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
