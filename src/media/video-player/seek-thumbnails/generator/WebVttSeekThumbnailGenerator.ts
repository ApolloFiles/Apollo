import { singleton } from 'tsyringe';

@singleton()
export default class WebVttSeekThumbnailGenerator {
  generate(
    thumbnailFileCount: number,
    thumbnailDimensions: [width: number, height: number],
    thumbnailGridSize: number,
    frameTimes: number[],
    thumbnailUrlGenerator: (frameIndex: number) => string,
  ): string {
    const widthOfSingleFrame = thumbnailDimensions[0] / thumbnailGridSize;
    const heightOfSingleFrame = thumbnailDimensions[1] / thumbnailGridSize;

    let result = 'WEBVTT\n\n';

    let processedFrames = 0;
    for (let frameIndex = 0; frameIndex < thumbnailFileCount; ++frameIndex) {
      const framesInThisFile = Math.min(thumbnailGridSize * thumbnailGridSize, frameTimes.length - processedFrames);

      for (let i = 0; i < framesInThisFile; ++i) {
        const x = (i % thumbnailGridSize) * widthOfSingleFrame;
        const y = Math.floor(i / thumbnailGridSize) * heightOfSingleFrame;

        const startTime = frameTimes[processedFrames + i];
        const endTime = frameTimes[processedFrames + i + 1] || startTime + 1; // If there's no next frame, assume a duration of 1 second

        result += `${this.toWebVttTime(startTime)} --> ${this.toWebVttTime(endTime)}\n`;
        result += `${thumbnailUrlGenerator(frameIndex)}#xywh=${x},${y},${widthOfSingleFrame},${heightOfSingleFrame}\n\n`;
      }

      processedFrames += framesInThisFile;
    }

    return result;
  }

  private toWebVttTime(timeInSeconds: number): string {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.000`;
  }
}
