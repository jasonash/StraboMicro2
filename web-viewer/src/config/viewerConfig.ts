/**
 * Viewer configuration: where project folders live and which links to show.
 *
 * Two builds share this code:
 * - server (npm run build): the strabospot.org viewer behind index.php.
 *   Links go to the server's download / share endpoints.
 * - standalone (npm run build:standalone): a folder anyone can put on a web
 *   server next to decompressed .smz folders. Options come from config.js
 *   (window.StraboMicroViewerConfig), which the deployer edits; the option
 *   names smzFilesLocation, showHeader and showFooter are the legacy
 *   viewer's (StraboSpot/StraboMicro-Web-Viewer assets/microView_config.js).
 *
 * Pure functions, no DOM access, so they can be tested in Node.
 */

export type ViewerMode = 'server' | 'standalone';

/** What the deployer may set in config.js. Every field is optional. */
export interface StandaloneConfigInput {
  smzFilesLocation?: unknown;
  showHeader?: unknown;
  showFooter?: unknown;
  showPdfLink?: unknown;
  smzDownloadUrl?: unknown;
  shareUrl?: unknown;
}

export interface ViewerConfig {
  mode: ViewerMode;
  /** Folder (URL) that holds one decompressed .smz folder per project, no trailing slash */
  baseUrl: string;
  /** Project folder name, or null when missing or not a plain folder name */
  projectId: string | null;
  /** The StraboMicro logo and name at the left of the top bar */
  showHeader: boolean;
  /** The "exported from StraboMicro" line under the viewer */
  showFooter: boolean;
  /** Standalone: offer project.pdf when the project folder has one */
  showPdfLink: boolean;
  /** Standalone: URL pattern for the .smz download, {id} = project folder name; '' = no button */
  smzDownloadUrl: string;
  /** Standalone: URL pattern for the Share button, {id} = project folder name; '' = no button */
  shareUrl: string;
}

export interface ViewerLinks {
  pdf: string | null;
  smz: string | null;
  share: string | null;
  /** strabomicro:// link; server only (it takes a strabospot.org project number) */
  openInApp: string | null;
  appDownload: string;
}

export const DEFAULT_SMZ_FILES_LOCATION = './smzFiles';
export const APP_DOWNLOAD_URL = 'https://strabospot.org/micro_download.php';

/**
 * A project id is used as one path segment of a URL. Allow only what project
 * folders are named with (v1: digits; v2: uuid), so ?p= cannot climb out of
 * the projects folder or point at another site.
 */
export function cleanProjectId(raw: string | null): string | null {
  if (!raw) return null;
  const id = raw.trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return null;
  return id;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Build the configuration from the page address and, for the standalone
 * build, config.js. The standalone build ignores ?base=: the deployer
 * decides where projects come from, not whoever writes a link.
 */
export function readViewerConfig(
  mode: ViewerMode,
  search: string,
  standaloneInput: StandaloneConfigInput | undefined,
): ViewerConfig {
  const params = new URLSearchParams(search);
  const projectId = cleanProjectId(params.get('p'));

  if (mode === 'server') {
    return {
      mode,
      baseUrl: withoutTrailingSlash(params.get('base') || DEFAULT_SMZ_FILES_LOCATION),
      projectId,
      showHeader: true,
      showFooter: false,
      showPdfLink: true,
      smzDownloadUrl: '',
      shareUrl: '',
    };
  }

  const input = standaloneInput ?? {};
  const location = text(input.smzFilesLocation);
  return {
    mode,
    baseUrl: withoutTrailingSlash(location || DEFAULT_SMZ_FILES_LOCATION),
    projectId,
    showHeader: bool(input.showHeader, true),
    showFooter: bool(input.showFooter, true),
    showPdfLink: bool(input.showPdfLink, true),
    smzDownloadUrl: text(input.smzDownloadUrl),
    shareUrl: text(input.shareUrl),
  };
}

function fillPattern(pattern: string, projectId: string): string | null {
  if (!pattern) return null;
  return pattern.split('{id}').join(encodeURIComponent(projectId));
}

/**
 * The links of the top bar. In the standalone build the PDF link appears only
 * once the caller has found project.pdf in the project folder (hasPdf).
 */
export function viewerLinks(config: ViewerConfig, projectId: string, hasPdf: boolean): ViewerLinks {
  if (config.mode === 'server') {
    // Server endpoints: the PDF one regenerates the PDF when a StraboSamples
    // edit has made it stale, so it must not link the static project.pdf.
    return {
      pdf: `/download_micro_pdf?project_id=${projectId}`,
      smz: `/download_micro_file?project_id=${projectId}`,
      share: `/share_micro_file?project_id=${projectId}`,
      openInApp: `strabomicro://open?p=${projectId}`,
      appDownload: '/micro_download.php',
    };
  }

  return {
    pdf: config.showPdfLink && hasPdf ? `${config.baseUrl}/${projectId}/project.pdf` : null,
    smz: fillPattern(config.smzDownloadUrl, projectId),
    share: fillPattern(config.shareUrl, projectId),
    openInApp: null,
    appDownload: APP_DOWNLOAD_URL,
  };
}
