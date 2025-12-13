/**
 * OpenCV.js Lazy Loader
 *
 * Handles lazy loading of OpenCV.js (~3MB WASM) to avoid impacting
 * initial app load time. OpenCV is only loaded when grain detection
 * is first used.
 */

import type { OpenCVLoadState } from './types';

// Type declaration for OpenCV.js
// Using 'any' here because @techstark/opencv-js doesn't have complete typings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenCVInstance = any;

// Module-level state
let cvInstance: OpenCVInstance | null = null;
let loadPromise: Promise<OpenCVInstance> | null = null;
let loadError: Error | null = null;

/**
 * Load OpenCV.js asynchronously.
 * Returns cached instance if already loaded.
 * Only loads once, subsequent calls return the same promise/instance.
 *
 * @returns Promise resolving to the OpenCV instance
 * @throws Error if OpenCV fails to load
 */
export async function loadOpenCV(): Promise<OpenCVInstance> {
  // Return cached instance if available
  if (cvInstance) {
    return cvInstance;
  }

  // Return existing promise if load is in progress
  if (loadPromise) {
    return loadPromise;
  }

  // Start loading
  loadPromise = new Promise<OpenCVInstance>((resolve, reject) => {
    import('@techstark/opencv-js')
      .then((opencvModule) => {
        const cv = opencvModule.default || opencvModule;

        // Check if OpenCV needs WASM initialization
        if (cv.onRuntimeInitialized !== undefined) {
          // WASM version - wait for initialization
          const originalCallback = cv.onRuntimeInitialized;

          cv.onRuntimeInitialized = () => {
            // Call original callback if it existed
            if (typeof originalCallback === 'function') {
              originalCallback();
            }

            cvInstance = cv;
            loadError = null;
            console.log('[GrainDetection] OpenCV.js loaded successfully (WASM)');
            resolve(cv);
          };

          // Handle load errors (onAbort may not exist on all builds)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ('onAbort' in cv) {
            (cv as any).onAbort = (msg: string) => {
              const error = new Error(`OpenCV.js failed to load: ${msg}`);
              loadError = error;
              loadPromise = null;
              reject(error);
            };
          }
        } else if (cv.Mat) {
          // Already initialized (asm.js version or pre-initialized)
          cvInstance = cv;
          loadError = null;
          console.log('[GrainDetection] OpenCV.js loaded successfully');
          resolve(cv);
        } else {
          // Unknown state - try to use it anyway
          cvInstance = cv;
          loadError = null;
          console.log('[GrainDetection] OpenCV.js loaded (unknown init state)');
          resolve(cv);
        }
      })
      .catch((error) => {
        console.error('[GrainDetection] Failed to load OpenCV.js:', error);
        loadError = error instanceof Error ? error : new Error(String(error));
        loadPromise = null;
        reject(loadError);
      });
  });

  return loadPromise;
}

/**
 * Check if OpenCV is loaded and ready to use.
 *
 * @returns true if OpenCV is loaded and ready
 */
export function isOpenCVLoaded(): boolean {
  return cvInstance !== null;
}

/**
 * Get the current OpenCV load state.
 *
 * @returns Current load state
 */
export function getOpenCVLoadState(): OpenCVLoadState {
  if (cvInstance) return 'ready';
  if (loadError) return 'error';
  if (loadPromise) return 'loading';
  return 'not-started';
}

/**
 * Get the OpenCV instance if already loaded.
 * Does not trigger loading - use loadOpenCV() for that.
 *
 * @returns OpenCV instance or null if not loaded
 */
export function getOpenCVInstance(): OpenCVInstance | null {
  return cvInstance;
}

/**
 * Get the last load error, if any.
 *
 * @returns Error or null
 */
export function getOpenCVLoadError(): Error | null {
  return loadError;
}

/**
 * Reset the loader state. Useful for retrying after an error.
 * Does not unload an already-loaded instance.
 */
export function resetOpenCVLoader(): void {
  if (!cvInstance) {
    loadPromise = null;
    loadError = null;
  }
}
