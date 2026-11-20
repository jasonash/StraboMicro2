/**
 * The parent image of a placement screen (rectangle, point, 3-point), and for
 * a parent that is half of a PPL/XPL pair the other half to show instead
 * (src/utils/placementBackdrop.ts).
 *
 * Both are the tile cache's medium copy (2048 px at most; small images give
 * their thumbnail). `frameImage` is the parent's own copy: its size is the
 * screen's display frame and all placement math uses it. `shownImage` is what
 * to draw, at the frame's size, so the other half lines up whatever size its
 * copy is.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useAppStore } from '@/store';
import { releaseImage } from '@/utils/imageUtils';
import { placementBackdrop, showSecondaryAfterPick, type PlacementBackdrop } from '@/utils/placementBackdrop';
import type { MicrographMetadata } from '@/types/project-types';

/** The remembered choice: show the XPL half (for this session, not saved) */
export const usePlacementBackdropStore = create<{ showSecondary: boolean; setShowSecondary: (v: boolean) => void }>((set) => ({
  showSecondary: false,
  setShowSecondary: (showSecondary) => set({ showSecondary }),
}));

async function loadMediumImage(projectId: string, micro: MicrographMetadata): Promise<HTMLImageElement | null> {
  const folderPaths = await window.api?.getProjectFolderPaths(projectId);
  if (!folderPaths) return null;
  const tileData = await window.api?.loadImageWithTiles(`${folderPaths.images}/${micro.imagePath || micro.id}`);
  if (!tileData) return null;
  const url = await window.api?.loadMedium(tileData.hash);
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export interface PlacementParent {
  /** The parent micrograph (scale, imageWidth), once found */
  parentMicrograph: MicrographMetadata | null;
  /** The parent's own copy: the display frame for all placement math */
  frameImage: HTMLImageElement | null;
  /** The image to draw at the frame's size (the parent's or its partner's) */
  shownImage: HTMLImageElement | null;
  backdrop: PlacementBackdrop | null;
  /** Show the partner half (true) or the parent's own image (false) */
  showPartner: (partner: boolean) => void;
  /** The partner's image is still loading */
  partnerLoading: boolean;
}

export function usePlacementParent(parentMicrographId: string | null | undefined, active = true): PlacementParent {
  const showSecondary = usePlacementBackdropStore((s) => s.showSecondary);
  const setShowSecondary = usePlacementBackdropStore((s) => s.setShowSecondary);
  const [parentMicrograph, setParentMicrograph] = useState<MicrographMetadata | null>(null);
  const [partnerMicrograph, setPartnerMicrograph] = useState<MicrographMetadata | null>(null);
  const [frameImage, setFrameImage] = useState<HTMLImageElement | null>(null);
  const [partnerImage, setPartnerImage] = useState<HTMLImageElement | null>(null);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const images = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    if (!active || !parentMicrographId) return;
    let cancelled = false;
    const keep = (img: HTMLImageElement | null) => {
      if (img) images.current.push(img);
      return img;
    };
    setFrameImage(null);
    setPartnerImage(null);
    const { project, micrographIndex } = useAppStore.getState();
    const parent = micrographIndex.get(parentMicrographId) ?? null;
    setParentMicrograph(parent);
    if (!project || !parent) {
      console.error('[usePlacementParent] Parent micrograph not found:', parentMicrographId);
      return;
    }
    const partner = placementBackdrop(parent, (id) => micrographIndex.get(id), false).partner;
    setPartnerMicrograph(partner);
    void (async () => {
      const img = keep(await loadMediumImage(project.id, parent));
      if (!cancelled) setFrameImage(img);
      if (!partner) return;
      // The other half loads right after, so the toggle is instant
      setPartnerLoading(true);
      const other = keep(await loadMediumImage(project.id, partner));
      if (!cancelled) {
        setPartnerImage(other);
        setPartnerLoading(false);
      }
    })().catch((error) => console.error('[usePlacementParent] Loading failed:', error));
    return () => {
      cancelled = true;
    };
  }, [parentMicrographId, active]);

  // Release every loaded copy when the screen closes
  useEffect(() => () => {
    images.current.forEach((img) => releaseImage(img));
    images.current = [];
  }, []);

  const backdrop = parentMicrograph
    ? placementBackdrop(parentMicrograph, (id) => (id === partnerMicrograph?.id ? partnerMicrograph : undefined), showSecondary)
    : null;

  const showPartner = useCallback((partner: boolean) => {
    if (backdrop) setShowSecondary(showSecondaryAfterPick(backdrop, partner));
  }, [backdrop, setShowSecondary]);

  const shownImage = backdrop?.showingPartner && partnerImage ? partnerImage : frameImage;
  return { parentMicrograph, frameImage, shownImage, backdrop, showPartner, partnerLoading };
}
