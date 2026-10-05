// Shared with the web app. Nothing here may import what only runs on the server.

/** The eight launch trades, in the order they are offered. */
export const SERVICE_CATEGORIES = [
  "plumbing",
  "electrical",
  "carpentry",
  "painting",
  "tiling",
  "brickwork",
  "roofing",
  "welding",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_NAMES: Record<ServiceCategory, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  carpentry: "Carpentry and cabinetry",
  painting: "Painting",
  tiling: "Tiling",
  brickwork: "Brickwork and plastering",
  roofing: "Roofing",
  welding: "Welding and metalwork",
};

export function isServiceCategory(value: unknown): value is ServiceCategory {
  return SERVICE_CATEGORIES.includes(value as ServiceCategory);
}
