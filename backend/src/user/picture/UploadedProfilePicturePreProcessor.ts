import Sharp from 'sharp';

export default class UploadedProfilePicturePreProcessor {
  processForUserProfile(pictureBytes: Buffer): Promise<Buffer> {
    return this.processImage(pictureBytes, 1024);
  }

  processForOAuthLink(pictureBytes: Buffer): Promise<Buffer> {
    return this.processImage(pictureBytes, 256);
  }

  private processImage(pictureBytes: Buffer, maxSize: number): Promise<Buffer> {
    return Sharp(pictureBytes, { limitInputPixels: 24_000_000, failOn: 'error' })
      .removeAlpha()
      .resize({ width: maxSize, height: maxSize, fit: 'cover', withoutEnlargement: true })
      .rotate()
      .png({ compressionLevel: 9, effort: 9 })
      .toBuffer();
  }
}
