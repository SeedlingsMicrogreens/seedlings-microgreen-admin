export type SeedlingsFeedbackType = "text" | "image" | "video";
export type PublishStatus = "draft" | "published";

export type SeedlingsFeedback = {
  id: string;
  type: SeedlingsFeedbackType;
  text?: string;
  imageUrl?: string;
  videoId?: string;
  status: PublishStatus;
  sortOrder: number;
};
