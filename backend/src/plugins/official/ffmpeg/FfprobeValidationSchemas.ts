import { z } from 'zod';

// Common

const OPTIONAL_TAGS = z
  .record(z.string().nonempty(), z.string())
  .optional()
  .default({});

// Streams

const STREAM_DISPOSITION = z
  .record(z.string().nonempty(), z.union([z.literal(0), z.literal(1)])
    .transform((value) => value === 1));
const STREAM_BASE = z.object({
  index: z.number().nonnegative(),
  codec_name: z.string().nonempty().optional(),
  codec_long_name: z.string().nonempty().optional(),
  codec_tag: z.string().nonempty(),
  codec_tag_string: z.string().nonempty(),
  r_frame_rate: z.string(),
  avg_frame_rate: z.string().regex(/^\d+\/\d+$/),
  time_base: z.string().nonempty(),
  start_pts: z.number().optional(),
  start_time: z.string().nonempty().optional(),
  duration: z.string().nonempty().optional(),
  duration_ts: z.number().nonnegative().optional(),

  extradata_size: z.number().nonnegative().optional(),
  side_data_list: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).optional(),
  disposition: STREAM_DISPOSITION,
  tags: OPTIONAL_TAGS,
});

const VIDEO_STREAM = STREAM_BASE.extend({
  codec_type: z.literal('video'),
  profile: z.string().nonempty().optional(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  coded_width: z.number().nonnegative(),
  coded_height: z.number().nonnegative(),
  has_b_frames: z.number(),
  sample_aspect_ratio: z.string().optional(),
  display_aspect_ratio: z.string().optional(),
  pix_fmt: z.string().nonempty().optional(),
  level: z.number(),
  color_range: z.string().optional(),
  color_space: z.string().optional(),
  color_transfer: z.string().optional(),
  color_primaries: z.string().optional(),
  chroma_location: z.string().optional(),
  refs: z.number().nonnegative(),
  view_ids_available: z.string().optional(),
  view_pos_available: z.string().optional(),
  bit_rate: z.string().optional(),
  bits_per_sample: z.number().nonnegative().optional(),
  bits_per_raw_sample: z.string().optional(),
  field_order: z.string().optional(),
  is_avc: z.string().optional(),
  nal_length_size: z.string().optional(),
  film_grain: z.number().nonnegative().optional(),
  closed_captions: z.number().nonnegative().optional(),

  // MP4 specific
  id: z.string().optional(),
  nb_frames: z.string().optional(),
});
const AUDIO_STREAM = STREAM_BASE.extend({
  codec_type: z.literal('audio'),
  channels: z.number().positive(),
  channel_layout: z.string().nonempty().optional(),
  profile: z.string().nonempty().optional(),
  bit_rate: z.string().optional(),
  bits_per_sample: z.number().nonnegative().optional(),
  bits_per_raw_sample: z.string().optional(),
  sample_fmt: z.string().nonempty(),
  sample_rate: z.string().nonempty(),
  initial_padding: z.number().nonnegative(),

  // DTS codec specific
  dmix_mode: z.string().optional(),
  ltrt_cmixlev: z.string().optional(),
  ltrt_surmixlev: z.string().optional(),
  loro_cmixlev: z.string().optional(),
  loro_surmixlev: z.string().optional(),

  // MP4 specific
  id: z.string().optional(),
  nb_frames: z.string().optional(),
});
const SUBTITLE_STREAM = STREAM_BASE.extend({
  codec_type: z.literal('subtitle'),

  // bitmap based subtitles
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
});
const ATTACHMENT_STREAM = STREAM_BASE.extend({
  codec_type: z.literal('attachment'),
});
const DATA_STREAM = STREAM_BASE.extend({
  codec_type: z.literal('data'),

  // MP4
  id: z.string().optional(),
  nb_frames: z.string().optional(),
});

// Probe result

const RESULT_STREAMS_ARRAY = z.array(
  z.discriminatedUnion('codec_type', [
    VIDEO_STREAM,
    AUDIO_STREAM,
    SUBTITLE_STREAM,
    ATTACHMENT_STREAM,
    DATA_STREAM,
  ]),
);

const RESULT_FORMAT = z.object({
  filename: z.string().nonempty(),
  nb_streams: z.number().nonnegative(),
  nb_stream_groups: z.number().nonnegative().optional(),
  nb_programs: z.number().nonnegative(),
  format_name: z.string().nonempty(),
  format_long_name: z.string().nonempty(),
  start_time: z.string().nonempty().optional(),
  duration: z.string().nonempty().optional(),
  size: z.string().nonempty().optional(),
  bit_rate: z.string().optional(),
  probe_score: z.number(),
  tags: OPTIONAL_TAGS,
});

const RESULT_CHAPTERS_ARRAY = z.array(z.object({
  id: z.number(),
  time_base: z.string(),
  start: z.number(),
  start_time: z.string(),
  end: z.number(),
  end_time: z.string(),
  tags: OPTIONAL_TAGS,
}));

// Exports

export const PROBE_RESULT_SCHEMA = z.object({
  format: RESULT_FORMAT,
});

export const PROBE_RESULT_FULL_SCHEMA = PROBE_RESULT_SCHEMA.extend({
  streams: RESULT_STREAMS_ARRAY,
  chapters: RESULT_CHAPTERS_ARRAY,
});
