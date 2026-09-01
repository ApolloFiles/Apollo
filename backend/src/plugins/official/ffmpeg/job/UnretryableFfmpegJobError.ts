/**
 * Thrown by a job that knows another acceleration profile is not going to help.
 *
 * This allows a job to communicate to the job runner, that there is no need to retry the job with another
 * constellation. Either because it knows a specific error case or something like a deadline ran out.
 */
export default class UnretryableFfmpegJobError extends Error {
}
