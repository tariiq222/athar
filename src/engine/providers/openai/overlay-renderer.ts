import { Injectable, Optional } from '@nestjs/common';
import satori from 'satori';
import sharp from 'sharp';
import type { BrandKit } from '../../types';
import { readFile } from 'node:fs/promises';

export type FontLoader = (font: string) => Promise<Buffer>;

const defaultFontLoader: FontLoader = async () => {
  // Bundled IBM Plex Sans Arabic regular; path set up at deploy time.
  return readFile(
    process.env.OVERLAY_FONT_PATH ?? './assets/fonts/IBMPlexSansArabic-Regular.ttf',
  );
};

/**
 * Programmatic text overlay used when gpt-image's rendered Arabic is
 * broken (or when the gate made overlay primary — see IMAGE_GATE_DECISION).
 * Renders the Arabic text via Satori and composites it onto the background.
 */
@Injectable()
export class OverlayRenderer {
  constructor(@Optional() private readonly fontLoader: FontLoader = defaultFontLoader) {}

  async render(
    background: Buffer,
    text: string,
    kit: BrandKit,
    size: [number, number],
  ): Promise<Buffer> {
    const [width, height] = size;
    const fontData = await this.fontLoader(kit.font);
    const color = kit.colors[0] ?? '#ffffff';

    const svg = await satori(
      {
        type: 'div',
        props: {
          style: {
            width,
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 80,
            textAlign: 'center',
            direction: 'rtl',
            color,
            fontFamily: kit.font,
            fontSize: 64,
            fontWeight: 700,
          },
          children: text,
        },
      } as unknown as Parameters<typeof satori>[0],
      {
        width,
        height,
        fonts: [{ name: kit.font, data: fontData, weight: 700, style: 'normal' }],
      },
    );

    const overlayPng = await sharp(Buffer.from(svg)).png().toBuffer();
    return sharp(background)
      .resize(width, height, { fit: 'cover' })
      .composite([{ input: overlayPng }])
      .png()
      .toBuffer();
  }
}