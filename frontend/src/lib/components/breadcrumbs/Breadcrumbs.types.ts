/**
 * One directory segment of a file path.
 *
 * The filesystem root is not a segment — it renders as the Apollo logo,
 * so a path like `/Music/Jazz` is two segments (`Music`, `Jazz`).
 */
export interface BreadcrumbSegment {
  /** Display name of the directory. */
  name: string;
  /** Opaque navigation identifier passed back to `onNavigate` (a uri/path; backend-agnostic). */
  uri: string;
}
