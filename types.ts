export enum AppMode {
  EDIT_SHADOW = 'EDIT_SHADOW',
  BACKGROUND_EDIT = 'BACKGROUND_EDIT', // New mode for background editing
  GENERATE = 'GENERATE',
  ANALYZE = 'ANALYZE',
  BATCH_EDIT_SHADOW = 'BATCH_EDIT_SHADOW', // New mode for batch processing
  REMOVE_BACKGROUND = 'REMOVE_BACKGROUND',
}

export enum AspectRatio {
  SQUARE = "1:1",
  PORTRAIT_3_4 = "3:4",
  PORTRAIT_9_16 = "9:16",
  LANDSCAPE_4_3 = "4:3",
  LANDSCAPE_16_9 = "16:9",
  LANDSCAPE_21_9 = "21:9",
  STANDARD_2_3 = "2:3",
  STANDARD_3_2 = "3:2"
}

export enum ImageSize {
  SIZE_1K = "1K",
  SIZE_2K = "2K",
  SIZE_4K = "4K"
}

export interface GeneratedContent {
  imageUrl?: string;
  text?: string;
}

export interface LoadingState {
  isLoading: boolean;
  message: string;
}

// New interface for managing images in batch mode
export interface BatchImageItem {
  id: string; // Unique identifier for each image in the batch
  file: File;
  previewUrl: string;
  originalDims: { w: number; h: number } | null;
  resultImage?: string | null;
  loading?: boolean;
  errorMessage?: string;
}