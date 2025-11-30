/**
 * useProjectPreparation Hook
 *
 * Provides a function to prepare project images (generate thumbnails/medium)
 * before allowing the user to browse. This ensures smooth navigation
 * especially when loading large projects with uncached images.
 *
 * Usage:
 *   const { prepareProject, isPreparingProject, preparationProgress } = useProjectPreparation();
 *
 *   // When loading a project:
 *   await prepareProject(projectData);
 *   loadProject(projectData, filePath);
 */

import { useState, useCallback, useEffect } from 'react';
import { ProjectMetadata, MicrographMetadata } from '@/types/project-types';

interface PreparationProgress {
  totalImages: number;
  completedImages: number;
  currentImageName: string;
}

interface UseProjectPreparationResult {
  prepareProject: (project: ProjectMetadata) => Promise<{ prepared: number; cached: number; total: number }>;
  isPreparingProject: boolean;
  preparationProgress: PreparationProgress;
}

/**
 * Recursively collect all micrographs from a project
 */
function collectAllMicrographs(project: ProjectMetadata): MicrographMetadata[] {
  const micrographs: MicrographMetadata[] = [];

  for (const dataset of project.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        micrographs.push(micrograph);
      }
    }
  }

  return micrographs;
}

export function useProjectPreparation(): UseProjectPreparationResult {
  const [isPreparingProject, setIsPreparingProject] = useState(false);
  const [preparationProgress, setPreparationProgress] = useState<PreparationProgress>({
    totalImages: 0,
    completedImages: 0,
    currentImageName: '',
  });

  // Listen for progress events from main process
  useEffect(() => {
    if (!window.api) return;

    const unsubProgress = window.api.onTileQueueProgress((progress) => {
      if (progress.isPreparationPhase) {
        setPreparationProgress({
          totalImages: progress.totalImages,
          completedImages: progress.completedImages,
          currentImageName: progress.currentImageName,
        });
      }
    });

    return () => {
      unsubProgress?.();
    };
  }, []);

  const prepareProject = useCallback(async (project: ProjectMetadata) => {
    if (!window.api) {
      console.warn('[useProjectPreparation] No API available');
      return { prepared: 0, cached: 0, total: 0 };
    }

    // Collect all micrographs
    const micrographs = collectAllMicrographs(project);

    if (micrographs.length === 0) {
      console.log('[useProjectPreparation] No micrographs to prepare');
      return { prepared: 0, cached: 0, total: 0 };
    }

    // Get project folder paths
    const folderPaths = await window.api.getProjectFolderPaths(project.id);

    // Build list of images to prepare
    // Filter to only micrographs that have an imagePath
    const imagesToPrepare: Array<{ imagePath: string; imageName: string }> = [];

    for (const micrograph of micrographs) {
      if (micrograph.imagePath) {
        const fullPath = `${folderPaths.images}/${micrograph.imagePath}`;
        imagesToPrepare.push({
          imagePath: fullPath,
          imageName: micrograph.name || micrograph.id,
        });
      }
    }

    if (imagesToPrepare.length === 0) {
      console.log('[useProjectPreparation] No images with paths to prepare');
      return { prepared: 0, cached: 0, total: 0 };
    }

    console.log(`[useProjectPreparation] Preparing ${imagesToPrepare.length} images...`);

    // Check how many are actually uncached
    let uncachedCount = 0;
    for (const img of imagesToPrepare) {
      const cacheStatus = await window.api.checkImageCache(img.imagePath);
      if (!cacheStatus.cached) {
        uncachedCount++;
      }
    }

    // If everything is cached, skip the preparation UI
    if (uncachedCount === 0) {
      console.log('[useProjectPreparation] All images already cached, skipping preparation');
      return { prepared: 0, cached: imagesToPrepare.length, total: imagesToPrepare.length };
    }

    console.log(`[useProjectPreparation] ${uncachedCount} images need preparation`);

    // Show preparation state
    setIsPreparingProject(true);
    setPreparationProgress({
      totalImages: imagesToPrepare.length,
      completedImages: 0,
      currentImageName: '',
    });

    try {
      // Run preparation
      const result = await window.api.prepareProjectImages(imagesToPrepare);
      console.log('[useProjectPreparation] Preparation complete:', result);
      return result;
    } finally {
      setIsPreparingProject(false);
      setPreparationProgress({
        totalImages: 0,
        completedImages: 0,
        currentImageName: '',
      });
    }
  }, []);

  return {
    prepareProject,
    isPreparingProject,
    preparationProgress,
  };
}

export default useProjectPreparation;
