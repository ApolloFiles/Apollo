import type { RawProbeResult } from '#src/plugins/official/ffmpeg/probe/FfprobeSchemas.js';

export const ARRIVAL_PATH = '/srv/media/movies/Arrival (2016)/Arrival (2016).mkv';

export function arrivalFormat(): RawProbeResult {
  return {
    filename: ARRIVAL_PATH,
    nb_streams: 2,
    nb_programs: 0,
    nb_stream_groups: 0,
    format_name: 'matroska,webm',
    format_long_name: 'Matroska / WebM',
    start_time: '0.000000',
    duration: '6967.103000',
    size: '4213645312',
    bit_rate: '4838302',
    probe_score: 100,
    tags: { title: 'Arrival', ENCODER: 'Lavf61.7.100' },
  };
}

/** What `ffprobe -show_format -show_streams -show_chapters` prints for a movie with an English and a German audio track */
export function arrivalFullProbe(): RawProbeResult {
  return {
    streams: [
      {
        index: 0,
        codec_name: 'aac',
        codec_long_name: 'AAC (Advanced Audio Coding)',
        profile: 'LC',
        codec_type: 'audio',
        codec_tag_string: '[0][0][0][0]',
        codec_tag: '0x0000',
        sample_fmt: 'fltp',
        sample_rate: '48000',
        channels: 2,
        channel_layout: 'stereo',
        bits_per_sample: 0,
        initial_padding: 1024,
        r_frame_rate: '0/0',
        avg_frame_rate: '0/0',
        time_base: '1/1000',
        start_pts: 0,
        start_time: '0.000000',
        disposition: { default: 1, dub: 0, forced: 0 },
        tags: { language: 'eng', DURATION: '01:56:07.103000000' },
      },
      {
        index: 1,
        codec_name: 'aac',
        codec_long_name: 'AAC (Advanced Audio Coding)',
        profile: 'LC',
        codec_type: 'audio',
        codec_tag_string: '[0][0][0][0]',
        codec_tag: '0x0000',
        sample_fmt: 'fltp',
        sample_rate: '48000',
        channels: 2,
        bits_per_sample: 0,
        initial_padding: 1024,
        r_frame_rate: '0/0',
        avg_frame_rate: '0/0',
        time_base: '1/1000',
        start_pts: 0,
        disposition: { default: 0, dub: 1, forced: 0 },
      },
    ],
    chapters: [],
    format: arrivalFormat(),
  };
}
