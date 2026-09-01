import { singleton } from 'tsyringe';

/**
 * Frames land on the sprite sheets in the order the decoder hands them out, which for keyframe-only HEVC is not
 * presentation order – so the cues are written sorted by time and point back at wherever their frame ended up.
 */
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
    const framesPerFile = thumbnailGridSize * thumbnailGridSize;

    const cues = frameTimes
      .map((time, position) => ({ time, position }))
      .filter(({ position }) => Math.floor(position / framesPerFile) < thumbnailFileCount)
      .sort((a, b) => a.time - b.time);

    let result = 'WEBVTT\n\n';
    for (let i = 0; i < cues.length; ++i) {
      const { time: startTime, position } = cues[i];
      const endTime = cues[i + 1]?.time ?? startTime + 1; // If there's no next frame, assume a duration of 1 second

      const fileIndex = Math.floor(position / framesPerFile);
      const positionInFile = position % framesPerFile;
      const x = (positionInFile % thumbnailGridSize) * widthOfSingleFrame;
      const y = Math.floor(positionInFile / thumbnailGridSize) * heightOfSingleFrame;

      result += `${this.toWebVttTime(startTime)} --> ${this.toWebVttTime(endTime)}\n`;
      result += `${thumbnailUrlGenerator(fileIndex)}#xywh=${x},${y},${widthOfSingleFrame},${heightOfSingleFrame}\n\n`;
    }

    return result;
  }

  private toWebVttTime(timeInSeconds: number): string {
    const totalMillis = Math.round(timeInSeconds * 1000);
    const hours = Math.floor(totalMillis / 3_600_000);
    const minutes = Math.floor((totalMillis % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMillis % 60_000) / 1000);
    const millis = totalMillis % 1000;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }
}
