export const COMMUNITY_CATEGORIES = [
  {
    id: "campus-life",
    label: "Campus Life",
    description: "Daily campus needs, local questions, and real-world coordination.",
    subcategories: [
      { id: "study", label: "Study" },
      { id: "events", label: "Events" },
      { id: "housing", label: "Housing" },
      {id: "food", label: "Food" },
      {id: "transportation", label: "Transportation" },
      {id: "major-specific", label: "Major-specific" },
    ],
  },
  {
    id: "interests",
    label: "Interests",
    description: "Shared hobbies and low-pressure spaces for common interests.",
    subcategories: [
      { id: "music", label: "Music" },
      { id: "gaming", label: "Gaming" },
      { id: "fitness", label: "Fitness" },
    ],
  },
  {
    id: "career",
    label: "Career",
    description: "Professional learning, portfolio help, and focused practice.",
    subcategories: [
      { id: "frontend", label: "Frontend" },
      { id: "backend", label: "Backend" },
      { id: "design", label: "Design" },
    ],
  },
] as const;

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];
export type CommunitySubcategory = CommunityCategory["subcategories"][number];

export const findCommunityCategory = (categoryId?: string | null) =>
  COMMUNITY_CATEGORIES.find((category) => category.id === categoryId) ?? null;

export const findCommunitySubcategory = (
  categoryId?: string | null,
  subcategoryId?: string | null,
) =>
  findCommunityCategory(categoryId)?.subcategories.find(
    (subcategory) => subcategory.id === subcategoryId,
  ) ?? null;

export const isValidCommunityCategoryPair = (
  categoryId?: string | null,
  subcategoryId?: string | null,
) => Boolean(findCommunitySubcategory(categoryId, subcategoryId));
