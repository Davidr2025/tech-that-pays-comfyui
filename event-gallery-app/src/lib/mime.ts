const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function classifyContentType(contentType: string): { type: "IMAGE" | "VIDEO"; ext: string } | null {
  if (IMAGE_TYPES[contentType]) return { type: "IMAGE", ext: IMAGE_TYPES[contentType] };
  if (VIDEO_TYPES[contentType]) return { type: "VIDEO", ext: VIDEO_TYPES[contentType] };
  return null;
}
