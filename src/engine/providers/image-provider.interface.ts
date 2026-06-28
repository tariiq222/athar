import type { BrandKit, ImageAsset } from '../types';
import type { Platform } from '../../config/platform-limits';

export interface ImageProvider {
  generateImage(brief: string, kit: BrandKit, platform: Platform): Promise<ImageAsset>;
}