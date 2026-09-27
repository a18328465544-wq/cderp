export const imageMimeTypeValues = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMimeType = (typeof imageMimeTypeValues)[number];
