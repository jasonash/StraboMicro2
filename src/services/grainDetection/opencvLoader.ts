/**
 * OpenCV.js Lazy Loader
 *
 * Loads OpenCV.js from the bundled file in the public folder.
 * OpenCV.js is loaded via script tag since it expects a global context.
 */

import type { OpenCVLoadState } from './types';

// Type declaration for OpenCV.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenCVInstance = any;

// Module-level state
let cvInstance: OpenCVInstance | null = null;
let loadPromise: Promise<OpenCVInstance> | null = null;
let loadError: Error | null = null;

/**
 * Wait for cv to be ready by polling
 */
function waitForCv(timeoutMs: number): Promise<OpenCVInstance> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkReady = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cv = (window as any).cv;

      // Check if cv exists and has Mat (means it's fully initialized)
      if (cv && typeof cv.Mat === 'function') {
        console.log('[GrainDetection] cv.Mat found, OpenCV ready!');
        resolve(cv);
        return;
      }

      // Check if cv is a function that needs to be called (factory pattern)
      if (cv && typeof cv === 'function') {
        console.log('[GrainDetection] cv is a factory function, calling it...');
        try {
          const cvResult = cv();
          if (cvResult && typeof cvResult.then === 'function') {
            // It's a Promise
            cvResult.then(
              (resolvedCv: OpenCVInstance) => {
                console.log('[GrainDetection] Factory Promise resolved');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).cv = resolvedCv;
                resolve(resolvedCv);
              },
              (err: Error) => {
                reject(err);
              }
            );
            return;
          } else if (cvResult && typeof cvResult.Mat === 'function') {
            console.log('[GrainDetection] Factory returned cv directly');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).cv = cvResult;
            resolve(cvResult);
            return;
          }
        } catch (e) {
          console.log('[GrainDetection] Factory call failed, will retry:', e);
        }
      }

      // Check if cv has onRuntimeInitialized (WASM not ready yet)
      if (cv && 'onRuntimeInitialized' in cv && typeof cv.Mat !== 'function') {
        console.log('[GrainDetection] Waiting for WASM runtime...');
        cv.onRuntimeInitialized = () => {
          console.log('[GrainDetection] WASM runtime initialized');
          resolve(cv);
        };
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error('OpenCV.js initialization timed out'));
        return;
      }

      // Not ready yet, retry
      setTimeout(checkReady, 100);
    };

    checkReady();
  });
}

/**
 * Load OpenCV.js asynchronously.
 * Uses the bundled opencv.js file from the public folder.
 *
 * @returns Promise resolving to the OpenCV instance
 * @throws Error if OpenCV fails to load
 */
export async function loadOpenCV(): Promise<OpenCVInstance> {
  console.log('[GrainDetection] loadOpenCV() called');

  // Return cached instance if available
  if (cvInstance) {
    console.log('[GrainDetection] Returning cached cvInstance');
    return cvInstance;
  }

  // Check if already loaded globally (handles HMR case where module reloads but cv persists)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalCv = (window as any).cv;
  if (globalCv && typeof globalCv.Mat === 'function') {
    console.log('[GrainDetection] OpenCV.js already available globally');
    cvInstance = globalCv;
    return cvInstance;
  }

  // Return existing promise if load is in progress
  if (loadPromise) {
    console.log('[GrainDetection] Returning existing loadPromise');
    return loadPromise;
  }

  // Check if script tag already exists (from previous load or HMR)
  const existingScript = document.querySelector('script[src="/opencv.js"]');

  if (existingScript) {
    console.log('[GrainDetection] Script tag already exists, waiting for cv...');
    // Script exists, just wait for cv to be ready
    loadPromise = waitForCv(30000)
      .then((cv) => {
        cvInstance = cv;
        loadError = null;
        console.log('[GrainDetection] cv ready from existing script');
        return cv;
      })
      .catch((err) => {
        loadError = err;
        loadPromise = null;
        throw err;
      });
    return loadPromise;
  }

  // Load via new script tag
  console.log('[GrainDetection] Loading OpenCV.js from bundled file...');

  loadPromise = new Promise<OpenCVInstance>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/opencv.js';
    script.async = true;

    const timeout = setTimeout(() => {
      const error = new Error('OpenCV.js load timed out after 30 seconds');
      loadError = error;
      loadPromise = null;
      reject(error);
    }, 30000);

    script.onerror = () => {
      clearTimeout(timeout);
      const error = new Error('Failed to load OpenCV.js from /opencv.js');
      loadError = error;
      loadPromise = null;
      console.error('[GrainDetection]', error.message);
      reject(error);
    };

    script.onload = () => {
      console.log('[GrainDetection] Script loaded, waiting for cv initialization...');
      clearTimeout(timeout);

      // Wait for cv to be ready
      waitForCv(10000)
        .then((cv) => {
          cvInstance = cv;
          loadError = null;
          console.log('[GrainDetection] OpenCV fully initialized');
          resolve(cv);
        })
        .catch((err) => {
          loadError = err;
          loadPromise = null;
          reject(err);
        });
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Check if OpenCV is loaded and ready to use.
 */
export function isOpenCVLoaded(): boolean {
  if (cvInstance) return true;
  // Also check global in case module was reloaded
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalCv = (window as any).cv;
  if (globalCv && typeof globalCv.Mat === 'function') {
    cvInstance = globalCv;
    return true;
  }
  return false;
}

/**
 * Get the current OpenCV load state.
 */
export function getOpenCVLoadState(): OpenCVLoadState {
  if (cvInstance) return 'ready';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalCv = (window as any).cv;
  if (globalCv && typeof globalCv.Mat === 'function') return 'ready';
  if (loadError) return 'error';
  if (loadPromise) return 'loading';
  return 'not-started';
}

/**
 * Get the OpenCV instance if already loaded.
 */
export function getOpenCVInstance(): OpenCVInstance | null {
  if (cvInstance) return cvInstance;
  // Also check global
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalCv = (window as any).cv;
  if (globalCv && typeof globalCv.Mat === 'function') {
    cvInstance = globalCv;
    return cvInstance;
  }
  return null;
}

/**
 * Get the last load error, if any.
 */
export function getOpenCVLoadError(): Error | null {
  return loadError;
}

/**
 * Reset the loader state. Useful for retrying after an error.
 */
export function resetOpenCVLoader(): void {
  if (!cvInstance) {
    loadPromise = null;
    loadError = null;
  }
}
