import Sharp from 'sharp';
import sharp from 'sharp';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import type ApolloUser from '../ApolloUser.js';

@singleton()
export default class ProfilePictureProvider {
  private readonly BACKGROUND_COLORS: Sharp.Color[] = [
    { r: 0x1f, g: 0x6a, b: 0x8a }, // Teal
    { r: 0x3f, g: 0x51, b: 0xb5 }, // Indigo
    { r: 0x5e, g: 0x35, b: 0xb1 }, // Purple
    { r: 0x2e, g: 0x7d, b: 0x32 }, // Green
    { r: 0xc6, g: 0x28, b: 0x28 }, // Red
    { r: 0xef, g: 0x6c, b: 0x00 }, // Orange
  ];

  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async provide(user: ApolloUser): Promise<Buffer> {
    const profilePicture = await this.databaseClient.authUser.findUnique({
      where: { id: user.id },
      select: { profilePicture: true },
    });

    if (profilePicture?.profilePicture != null) {
      return Buffer.from(profilePicture.profilePicture);
    }
    return this.generateFallback(user);
  }

  private generateFallback(user: ApolloUser): Promise<Buffer> {
    const startingLetters = this.determineStartingLetters(user.displayName) || '?';

    return sharp({
      create: {
        width: 512,
        height: 512,
        channels: 3,
        background: this.chooseBackgroundColor(user),
      },
    })
      .composite([{
        input: {
          text: {
            text: `<span foreground="white">${startingLetters}</span>`,
            rgba: true,
            width: 400,
            height: 400,
          },
        },
      }])
      .png()
      .toBuffer();
  }

  private determineStartingLetters(name: string): string {
    return name
      .split(/[\s@_-]/g)
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  private chooseBackgroundColor(user: ApolloUser): Sharp.Color {
    const userIdSum = Buffer
      .from(user.id)
      .reduce((a, b) => a + b, 0);
    return this.BACKGROUND_COLORS[userIdSum % this.BACKGROUND_COLORS.length];
  }
}
