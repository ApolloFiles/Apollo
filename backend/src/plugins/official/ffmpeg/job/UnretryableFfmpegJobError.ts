/**
 * Thrown by a job that knows another acceleration profile is not going to help.
 *
 * The runner cannot tell on its own: it only ever sees that an attempt failed, and reads FFmpeg's own log to spot
 * the handful of failures that are hopeless. Anything a job knows beyond that – a deadline of its own having run
 * out, for instance – it has to say.
 */
export default class UnretryableFfmpegJobError extends Error {
}
