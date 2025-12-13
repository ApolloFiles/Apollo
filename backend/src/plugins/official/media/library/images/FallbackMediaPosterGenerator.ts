import sharp from 'sharp';
import { singleton } from 'tsyringe';
import ImageFileConstants from './ImageFileConstants.js';

@singleton()
export default class FallbackMediaPosterGenerator {
  private static readonly POSTER_WIDTH = 500;
  private static readonly POSTER_HEIGHT = 750;
  private static readonly TEXT_WIDTH = Math.floor(500 * 0.6); // 300
  private static readonly TEXT_HEIGHT = Math.floor(750 * 0.6); // 450

  async generatePoster(mediaTitle: string, format: 'jpeg' | 'avif'): Promise<Buffer> {
    const posterText = this.determineStartingLetters(mediaTitle) || 'No Title';

    const poster = sharp({
      create: {
        width: FallbackMediaPosterGenerator.POSTER_WIDTH,
        height: FallbackMediaPosterGenerator.POSTER_HEIGHT,
        channels: 3,
        background: { r: 0x00, g: 0x64, b: 0xf7 },
      },
    })
      .composite([{
        input: {
          text: {
            text: `<span foreground="white">${posterText}</span>`,
            rgba: true,
            width: FallbackMediaPosterGenerator.TEXT_WIDTH,
            height: FallbackMediaPosterGenerator.TEXT_HEIGHT,
          },
        },
      }]);

    if (format === 'avif') {
      return poster
        .avif(ImageFileConstants.POSTER_OPTIONS_AVIF)
        .toBuffer();
    } else if (format === 'jpeg') {
      return poster
        .jpeg(ImageFileConstants.POSTER_OPTIONS_JPEG)
        .toBuffer();
    }

    throw new Error('Cannot generate poster for unsupported format: ' + JSON.stringify(format));
  }

  private determineStartingLetters(title: string): string {
    return title
      .split(/[\s_-]/g)
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase();
  }
}
