export type ProductType = 'vinyl' | 'book' | 'poster' | 'magazine' | 'packaging';

export interface MockupConfig {
  productType: ProductType;
  prompt: string;
  referenceImage?: string;
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
}

export interface ProductTemplate {
  id: ProductType;
  name: string;
  description: string;
  icon: string;
  defaultPrompt: string;
}

export interface SavedMockup {
  id: string;
  url: string;
  productType: ProductType;
  prompt: string;
  timestamp: number;
}
