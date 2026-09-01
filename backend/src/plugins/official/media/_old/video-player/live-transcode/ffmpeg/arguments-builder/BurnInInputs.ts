/**
 * Which `-i` of the (repeated) source file each stream comes from while a subtitle is burned in, see
 * {@link LiveTranscodeLauncher.buildArgs}. Without a burned-in subtitle everything comes from input 0.
 *
 * Every decoded stream gets a demuxer of its own – two audio tracks sharing one still leaked, the same way video
 * and subtitle sharing one did.
 */
export const BURN_IN_INPUT = {
  subtitle: 0,
  video: 1,
  audio: (outputAudioIndex: number): number => 2 + outputAudioIndex,
} as const;
