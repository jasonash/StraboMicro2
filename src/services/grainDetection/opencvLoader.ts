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
 * Check if cv is ready (has Mat function)
 */
function isCvReady(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cv = (window as any).cv;
  return cv && typeof cv.Mat === 'function';
}

/**
 * Get the cv instance from window
 */
function getCv(): OpenCVInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).cv;
}

/**
 * Load OpenCV.js with a callback (bypasses Promise issues).
 */
export function loadOpenCVWithCallback(
  onSuccess: (cv: OpenCVInstance) => void,
  onError: (error: Error) => void
): void {
  console.log('[GrainDetection] loadOpenCVWithCallback() called');

  // Return cached instance if available
  if (cvInstance) {
    console.log('[GrainDetection] Returning cached cvInstance via callback');
    setTimeout(() => onSuccess(cvInstance!), 0);
    return;
  }

  // Check if already loaded globally
  if (isCvReady()) {
    console.log('[GrainDetection] OpenCV.js already available globally');
    cvInstance = getCv();
    setTimeout(() => onSuccess(cvInstance!), 0);
    return;
  }

  const existingScript = document.querySelector('script[src="/opencv.js"]');
  const startTime = Date.now();
  const timeoutMs = 30000;

  const pollForCv = () => {
    if (isCvReady()) {
      const cv = getCv();
      console.log('[GrainDetection] cv is ready! Calling success callback...');
      cvInstance = cv;
      loadError = null;
      onSuccess(cv);
      return;
    }

    if (Date.now() - startTime > timeoutMs) {
      const error = new Error('OpenCV.js initialization timed out');
      loadError = error;
      onError(error);
      return;
    }

    setTimeout(pollForCv, 100);
  };

  if (!existingScript) {
    console.log('[GrainDetection] Loading OpenCV.js from bundled file...');
    const script = document.createElement('script');
    script.src = '/opencv.js';
    script.async = true;

    script.onerror = () => {
      const error = new Error('Failed to load OpenCV.js from /opencv.js');
      loadError = error;
      onError(error);
    };

    script.onload = () => {
      console.log('[GrainDetection] Script loaded, starting to poll...');
      setTimeout(pollForCv, 50);
    };

    document.head.appendChild(script);
  } else {
    console.log('[GrainDetection] Script exists, polling...');
    setTimeout(pollForCv, 50);
  }
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
    // Explicitly return via Promise.resolve to ensure proper async behavior
    return Promise.resolve(cvInstance);
  }

  // Check if already loaded globally (handles HMR case where module reloads but cv persists)
  if (isCvReady()) {
    console.log('[GrainDetection] OpenCV.js already available globally');
    cvInstance = getCv();
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
    console.log('[GrainDetection] Script tag already exists, polling for cv...');
  } else {
    console.log('[GrainDetection] Loading OpenCV.js from bundled file...');
  }

  // Create the load promise
  loadPromise = new Promise<OpenCVInstance>((resolve, reject) => {
    const startTime = Date.now();
    const timeoutMs = 30000;

    // Polling function to check if cv is ready
    const pollForCv = () => {
      // Check if ready
      if (isCvReady()) {
        const cv = getCv();
        console.log('[GrainDetection] cv is ready! Scheduling resolve...');
        cvInstance = cv;
        loadError = null;
        // Use requestAnimationFrame to ensure we're out of any blocking context
        requestAnimationFrame(() => {
          console.log('[GrainDetection] Resolving promise now');
          resolve(cv);
        });
        return;
      }

      // Check for factory pattern
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cv = (window as any).cv;
      if (cv && typeof cv === 'function') {
        console.log('[GrainDetection] cv is a factory function, attempting to call...');
        try {
          const result = cv();
          if (result && typeof result.then === 'function') {
            result.then(
              (resolvedCv: OpenCVInstance) => {
                console.log('[GrainDetection] Factory promise resolved');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).cv = resolvedCv;
                cvInstance = resolvedCv;
                loadError = null;
                resolve(resolvedCv);
              },
              (err: Error) => {
                loadError = err;
                loadPromise = null;
                reject(err);
              }
            );
            return;
          }
        } catch (e) {
          // Factory call failed, continue polling
        }
      }

      // Check for onRuntimeInitialized
      if (cv && 'onRuntimeInitialized' in cv && typeof cv.Mat !== 'function') {
        console.log('[GrainDetection] Setting up onRuntimeInitialized callback...');
        cv.onRuntimeInitialized = () => {
          console.log('[GrainDetection] WASM runtime initialized');
          cvInstance = cv;
          loadError = null;
          resolve(cv);
        };
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        const error = new Error('OpenCV.js initialization timed out');
        loadError = error;
        loadPromise = null;
        reject(error);
        return;
      }

      // Not ready yet, poll again
      setTimeout(pollForCv, 100);
    };

    // If script doesn't exist, create and load it
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = '/opencv.js';
      script.async = true;

      script.onerror = () => {
        const error = new Error('Failed to load OpenCV.js from /opencv.js');
        loadError = error;
        loadPromise = null;
        console.error('[GrainDetection]', error.message);
        reject(error);
      };

      script.onload = () => {
        console.log('[GrainDetection] Script element loaded, will start polling shortly...');
        // Give the browser a moment to breathe before polling
        setTimeout(() => {
          console.log('[GrainDetection] Starting to poll for cv...');
          pollForCv();
        }, 50);
      };

      document.head.appendChild(script);
    } else {
      // Script exists, just start polling after a brief delay
      setTimeout(() => {
        console.log('[GrainDetection] Starting to poll for cv (existing script)...');
        pollForCv();
      }, 50);
    }
  });

  return loadPromise;
}

/**
 * Check if OpenCV is loaded and ready to use.
 */
export function isOpenCVLoaded(): boolean {
  if (cvInstance) return true;
  if (isCvReady()) {
    cvInstance = getCv();
    return true;
  }
  return false;
}

/**
 * Get the current OpenCV load state.
 */
export function getOpenCVLoadState(): OpenCVLoadState {
  if (cvInstance) return 'ready';
  if (isCvReady()) return 'ready';
  if (loadError) return 'error';
  if (loadPromise) return 'loading';
  return 'not-started';
}

/**
 * Get the OpenCV instance if already loaded.
 */
export function getOpenCVInstance(): OpenCVInstance | null {
  if (cvInstance) return cvInstance;
  if (isCvReady()) {
    cvInstance = getCv();
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
