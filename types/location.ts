export type LocationType = "rack" | "room" | "tray_area" | "storage" | "other";
export type LocationThresholdUnit = "gms" | "kg";
export type Location = {
  id: string;
  name: string;
  type: LocationType;
  active: boolean;
  thresholdGrams?: number;
  thresholdValue?: number;
  thresholdUnit?: LocationThresholdUnit;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};
