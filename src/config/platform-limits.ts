export type Platform = 'linkedin' | 'x';

export interface PlatformLimit {
  maxChars: number;
  premiumMaxChars?: number;
  hookChars?: number; // visible-before-truncation (LinkedIn mobile)
  hashtags: { min: number; max: number };
  images: { max: number; defaultSize: [number, number] };
  altMaxChars: number;
  linkRule: string;
}

export const PLATFORM_LIMITS: Record<Platform, PlatformLimit> = {
  linkedin: {
    maxChars: 3000,
    hookChars: 140,
    hashtags: { min: 3, max: 5 },
    images: { max: 20, defaultSize: [1200, 1200] },
    altMaxChars: 120,
    linkRule: 'paste url in body, remove preview card',
  },
  x: {
    maxChars: 280,
    premiumMaxChars: 25000,
    hashtags: { min: 1, max: 2 },
    images: { max: 4, defaultSize: [1200, 1200] },
    altMaxChars: 1000,
    linkRule: 'put link in a reply, not the main post',
  },
};

export function getLimit(platform: Platform): PlatformLimit {
  return PLATFORM_LIMITS[platform];
}