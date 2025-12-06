/**
 * Image Comparator Dialog
 *
 * A two-stage dialog for comparing micrographs:
 * 1. First stage: Select a micrograph to compare with (matching aspect ratio)
 * 2. Second stage: Full-screen comparison view with draggable scrubber
 *
 * The comparison view shows two tiled images overlaid with a vertical
 * divider that can be dragged to reveal more of either image.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import CompareIcon from '@mui/icons-material/Compare';
import CloseIcon from '@mui/icons-material/Close';
import { Stage, Layer, Image as KonvaImage, Rect, Group } from 'react-konva';
import { useAppStore } from '@/store';

const TILE_SIZE = 256;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.1;

interface ImageComparatorDialogProps {
  open: boolean;
  onClose: () => void;
  sourceMicrographId: string | null;
}

interface TileInfo {
  x: number;
  y: number;
  dataUrl: string;
  imageObj?: HTMLImageElement;
}

interface ImageData {
  hash: string;
  width: number;
  height: number;
  tilesX: number;
  tilesY: number;
  imagePath: string;
}

interface MatchingMicrograph {
  id: string;
  name: string;
  width: number;
  height: number;
  sampleName?: string;
}

export function ImageComparatorDialog({
  open,
  onClose,
  sourceMicrographId,
}: ImageComparatorDialogProps) {
  const project = useAppStore((state) => state.project);

  // Stage management
  const [stage, setStage] = useState<'select' | 'compare'>('select');
  const [selectedMicrographId, setSelectedMicrographId] = useState<string | null>(null);

  // Matching micrographs for selection
  const [matchingMicrographs, setMatchingMicrographs] = useState<MatchingMicrograph[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  // Comparison state
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scrubberPosition, setScrubberPosition] = useState(0.5); // 0-1, percentage from left
  const [isDraggingScrubber, setIsDraggingScrubber] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  // Image data
  const [leftImageData, setLeftImageData] = useState<ImageData | null>(null);
  const [rightImageData, setRightImageData] = useState<ImageData | null>(null);
  const [leftTiles, setLeftTiles] = useState<Map<string, TileInfo>>(new Map());
  const [rightTiles, setRightTiles] = useState<Map<string, TileInfo>>(new Map());
  const [leftThumbnail, setLeftThumbnail] = useState<HTMLImageElement | null>(null);
  const [rightThumbnail, setRightThumbnail] = useState<HTMLImageElement | null>(null);


  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Get source micrograph info
  const sourceMicrograph = useCallback(() => {
    if (!project || !sourceMicrographId) return null;
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.id === sourceMicrographId) return micro;
        }
      }
    }
    return null;
  }, [project, sourceMicrographId]);

  // Find micrographs with matching aspect ratio
  useEffect(() => {
    if (!open || !project || !sourceMicrographId) return;

    const source = sourceMicrograph();
    if (!source) return;

    const sourceWidth = source.imageWidth || source.width || 0;
    const sourceHeight = source.imageHeight || source.height || 0;
    if (!sourceWidth || !sourceHeight) return;

    const sourceAspect = sourceWidth / sourceHeight;
    const tolerance = 0.01; // 1% tolerance for aspect ratio matching

    const matches: MatchingMicrograph[] = [];

    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.id === sourceMicrographId) continue; // Skip source

          const width = micro.imageWidth || micro.width || 0;
          const height = micro.imageHeight || micro.height || 0;
          if (!width || !height) continue;

          const aspect = width / height;
          const aspectDiff = Math.abs(aspect - sourceAspect) / sourceAspect;

          if (aspectDiff <= tolerance) {
            matches.push({
              id: micro.id,
              name: micro.name || 'Unnamed',
              width,
              height,
              sampleName: sample.label || sample.sampleID || undefined,
            });
          }
        }
      }
    }

    setMatchingMicrographs(matches);
  }, [open, project, sourceMicrographId, sourceMicrograph]);

  // Load thumbnails for matching micrographs
  useEffect(() => {
    if (!open || !project || matchingMicrographs.length === 0) return;

    const loadThumbnails = async () => {
      const newThumbnails: Record<string, string> = {};
      const folderPaths = await window.api?.getProjectFolderPaths(project.id);
      if (!folderPaths) return;

      for (const micro of matchingMicrographs) {
        try {
          // Build path: images/<micrograph-id> (no extension)
          const imagePath = `${folderPaths.images}/${micro.id}`;

          // Check if cached, get hash
          const cacheInfo = await window.api?.checkImageCache(imagePath);
          if (cacheInfo?.cached && cacheInfo.hash) {
            // Load thumbnail using hash
            const thumbDataUrl = await window.api?.loadThumbnail(cacheInfo.hash);
            if (thumbDataUrl) {
              newThumbnails[micro.id] = thumbDataUrl;
            }
          }
        } catch (err) {
          console.error(`Failed to load thumbnail for ${micro.id}:`, err);
        }
      }

      setThumbnails(newThumbnails);
    };

    loadThumbnails();
  }, [open, project, matchingMicrographs]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStage('select');
      setSelectedMicrographId(null);
      setScrubberPosition(0.5);
      setLeftTiles(new Map());
      setRightTiles(new Map());
      setLeftThumbnail(null);
      setRightThumbnail(null);
      setLeftImageData(null);
      setRightImageData(null);
    }
  }, [open]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current || stage !== 'compare') return;

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setStageSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [stage]);

  // Load image data and thumbnails for comparison
  const loadComparisonImages = useCallback(async () => {
    if (!project || !sourceMicrographId || !selectedMicrographId) return;

    setIsLoading(true);

    try {
      // Get image paths (no extension - images stored as micrograph ID)
      const folderPaths = await window.api?.getProjectFolderPaths(project.id);
      if (!folderPaths) throw new Error('Could not get project folder paths');

      const leftPath = `${folderPaths.images}/${sourceMicrographId}`;
      const rightPath = `${folderPaths.images}/${selectedMicrographId}`;

      // Load metadata and tiles for both images
      const [leftResult, rightResult] = await Promise.all([
        window.api?.loadImageWithTiles(leftPath),
        window.api?.loadImageWithTiles(rightPath),
      ]);

      if (leftResult) {
        setLeftImageData({
          hash: leftResult.hash,
          width: leftResult.metadata.width,
          height: leftResult.metadata.height,
          tilesX: leftResult.metadata.tilesX,
          tilesY: leftResult.metadata.tilesY,
          imagePath: leftPath,
        });

        // Load thumbnail
        const thumbDataUrl = await window.api?.loadThumbnail(leftResult.hash);
        if (thumbDataUrl) {
          const img = new Image();
          img.onload = () => setLeftThumbnail(img);
          img.src = thumbDataUrl;
        }
      }

      if (rightResult) {
        setRightImageData({
          hash: rightResult.hash,
          width: rightResult.metadata.width,
          height: rightResult.metadata.height,
          tilesX: rightResult.metadata.tilesX,
          tilesY: rightResult.metadata.tilesY,
          imagePath: rightPath,
        });

        // Load thumbnail
        const thumbDataUrl = await window.api?.loadThumbnail(rightResult.hash);
        if (thumbDataUrl) {
          const img = new Image();
          img.onload = () => setRightThumbnail(img);
          img.src = thumbDataUrl;
        }
      }

      // Fit both images to screen
      if (leftResult && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const scaleX = containerWidth / leftResult.metadata.width;
        const scaleY = containerHeight / leftResult.metadata.height;
        const newZoom = Math.min(scaleX, scaleY) * 0.9;

        setZoom(newZoom);
        setPosition({
          x: (containerWidth - leftResult.metadata.width * newZoom) / 2,
          y: (containerHeight - leftResult.metadata.height * newZoom) / 2,
        });
      }
    } catch (err) {
      console.error('Failed to load comparison images:', err);
    } finally {
      setIsLoading(false);
    }
  }, [project, sourceMicrographId, selectedMicrographId]);

  // Start comparison when micrograph is selected
  const handleStartComparison = useCallback(() => {
    if (!selectedMicrographId) return;
    setStage('compare');
    loadComparisonImages();
  }, [selectedMicrographId, loadComparisonImages]);

  // Load visible tiles for both images
  const loadVisibleTiles = useCallback(async () => {
    if (!leftImageData || !rightImageData) return;

    // Calculate visible tile range based on viewport
    const viewportLeft = -position.x / zoom;
    const viewportTop = -position.y / zoom;
    const viewportRight = viewportLeft + stageSize.width / zoom;
    const viewportBottom = viewportTop + stageSize.height / zoom;

    const startTileX = Math.max(0, Math.floor(viewportLeft / TILE_SIZE));
    const startTileY = Math.max(0, Math.floor(viewportTop / TILE_SIZE));
    const endTileX = Math.min(leftImageData.tilesX - 1, Math.ceil(viewportRight / TILE_SIZE));
    const endTileY = Math.min(leftImageData.tilesY - 1, Math.ceil(viewportBottom / TILE_SIZE));

    // Collect tiles to load
    const leftTilesToLoad: Array<{ x: number; y: number }> = [];
    const rightTilesToLoad: Array<{ x: number; y: number }> = [];

    for (let ty = startTileY; ty <= endTileY; ty++) {
      for (let tx = startTileX; tx <= endTileX; tx++) {
        const tileKey = `${tx}_${ty}`;
        if (!leftTiles.has(tileKey)) {
          leftTilesToLoad.push({ x: tx, y: ty });
        }
        if (!rightTiles.has(tileKey)) {
          rightTilesToLoad.push({ x: tx, y: ty });
        }
      }
    }

    // Load tiles in batches
    if (leftTilesToLoad.length > 0) {
      const results = await window.api?.loadTilesBatch(leftImageData.hash, leftTilesToLoad);
      if (results) {
        setLeftTiles((prev) => {
          const newMap = new Map(prev);
          for (const tile of results) {
            const tileKey = `${tile.x}_${tile.y}`;
            const img = new Image();
            img.src = tile.dataUrl;
            newMap.set(tileKey, { x: tile.x, y: tile.y, dataUrl: tile.dataUrl, imageObj: img });
          }
          return newMap;
        });
      }
    }

    if (rightTilesToLoad.length > 0) {
      const results = await window.api?.loadTilesBatch(rightImageData.hash, rightTilesToLoad);
      if (results) {
        setRightTiles((prev) => {
          const newMap = new Map(prev);
          for (const tile of results) {
            const tileKey = `${tile.x}_${tile.y}`;
            const img = new Image();
            img.src = tile.dataUrl;
            newMap.set(tileKey, { x: tile.x, y: tile.y, dataUrl: tile.dataUrl, imageObj: img });
          }
          return newMap;
        });
      }
    }
  }, [leftImageData, rightImageData, position, zoom, stageSize, leftTiles, rightTiles]);

  // Load tiles when viewport changes
  useEffect(() => {
    if (stage === 'compare' && leftImageData && rightImageData) {
      loadVisibleTiles();
    }
  }, [stage, leftImageData, rightImageData, position, zoom, loadVisibleTiles]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();

    const stageNode = stageRef.current;
    if (!stageNode) return;

    const pointer = stageNode.getPointerPosition();
    if (!pointer) return;

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newZoom = direction > 0
      ? Math.min(zoom * ZOOM_STEP, MAX_ZOOM)
      : Math.max(zoom / ZOOM_STEP, MIN_ZOOM);

    // Zoom toward pointer position
    const mousePointTo = {
      x: (pointer.x - position.x) / zoom,
      y: (pointer.y - position.y) / zoom,
    };

    setZoom(newZoom);
    setPosition({
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    });
  }, [zoom, position]);

  // Handle panning
  const handleMouseDown = useCallback(() => {
    // Check if clicking on scrubber area (within 20px of scrubber line)
    const stageNode = stageRef.current;
    if (!stageNode) return;

    const pointer = stageNode.getPointerPosition();
    if (!pointer) return;

    const scrubberX = stageSize.width * scrubberPosition;
    if (Math.abs(pointer.x - scrubberX) < 20) {
      setIsDraggingScrubber(true);
      return;
    }

    setIsPanning(true);
    setLastPointerPos(pointer);
  }, [scrubberPosition, stageSize.width]);

  const handleMouseMove = useCallback(() => {
    const stageNode = stageRef.current;
    if (!stageNode) return;

    const pointer = stageNode.getPointerPosition();
    if (!pointer) return;

    if (isDraggingScrubber) {
      const newPosition = Math.max(0, Math.min(1, pointer.x / stageSize.width));
      setScrubberPosition(newPosition);
      return;
    }

    if (isPanning && lastPointerPos) {
      const dx = pointer.x - lastPointerPos.x;
      const dy = pointer.y - lastPointerPos.y;
      setPosition((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPointerPos(pointer);
    }
  }, [isDraggingScrubber, isPanning, lastPointerPos, stageSize.width]);

  const handleMouseUp = useCallback(() => {
    setIsDraggingScrubber(false);
    setIsPanning(false);
    setLastPointerPos(null);
  }, []);

  // Render tile images for one side
  const renderTiles = (
    tiles: Map<string, TileInfo>,
    thumbnail: HTMLImageElement | null,
    imageData: ImageData | null
  ) => {
    if (!imageData) return null;

    // If we have tiles, render them
    if (tiles.size > 0) {
      return Array.from(tiles.values()).map((tile) => {
        if (!tile.imageObj) return null;
        return (
          <KonvaImage
            key={`tile_${tile.x}_${tile.y}`}
            image={tile.imageObj}
            x={tile.x * TILE_SIZE}
            y={tile.y * TILE_SIZE}
          />
        );
      });
    }

    // Otherwise render thumbnail scaled up
    if (thumbnail) {
      return (
        <KonvaImage
          image={thumbnail}
          x={0}
          y={0}
          width={imageData.width}
          height={imageData.height}
        />
      );
    }

    return null;
  };

  // Selection stage UI
  if (stage === 'select') {
    const source = sourceMicrograph();

    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CompareIcon />
            <Typography variant="h6">Compare Image</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {source && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Comparing: <strong>{source.name || 'Unnamed'}</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {source.imageWidth || source.width} × {source.imageHeight || source.height} pixels
              </Typography>
            </Box>
          )}

          {matchingMicrographs.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No micrographs with matching aspect ratio found.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Select a micrograph to compare with ({matchingMicrographs.length} available):
              </Typography>
              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                {matchingMicrographs.map((micro) => (
                  <ListItemButton
                    key={micro.id}
                    selected={selectedMicrographId === micro.id}
                    onClick={() => setSelectedMicrographId(micro.id)}
                    sx={{ borderRadius: 1, mb: 0.5 }}
                  >
                    <ListItemAvatar>
                      <Avatar
                        variant="rounded"
                        src={thumbnails[micro.id]}
                        sx={{ width: 56, height: 56, mr: 1 }}
                      >
                        <CompareIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={micro.name}
                      secondary={
                        <>
                          {micro.sampleName && <span>{micro.sampleName} • </span>}
                          {micro.width} × {micro.height}
                        </>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!selectedMicrographId}
            onClick={handleStartComparison}
          >
            Compare
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Comparison stage UI
  const scrubberX = stageSize.width * scrubberPosition;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{
        sx: { bgcolor: 'background.default' }
      }}
    >
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CompareIcon /> Image Comparator
        </Typography>

        <Tooltip title="Close">
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Comparison canvas */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          cursor: isDraggingScrubber ? 'ew-resize' : isPanning ? 'grabbing' : 'grab',
        }}
      >
        {isLoading ? (
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
          }}>
            <CircularProgress />
            <Typography>Loading images...</Typography>
          </Box>
        ) : (
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Left image layer (clipped to left of scrubber) */}
            <Layer
              clipFunc={(ctx) => {
                ctx.rect(0, 0, scrubberX, stageSize.height);
              }}
            >
              <Group x={position.x} y={position.y} scaleX={zoom} scaleY={zoom}>
                {renderTiles(leftTiles, leftThumbnail, leftImageData)}
              </Group>
            </Layer>

            {/* Right image layer (clipped to right of scrubber) */}
            <Layer
              clipFunc={(ctx) => {
                ctx.rect(scrubberX, 0, stageSize.width - scrubberX, stageSize.height);
              }}
            >
              <Group x={position.x} y={position.y} scaleX={zoom} scaleY={zoom}>
                {renderTiles(rightTiles, rightThumbnail, rightImageData)}
              </Group>
            </Layer>

            {/* Scrubber line */}
            <Layer>
              <Rect
                x={scrubberX - 2}
                y={0}
                width={4}
                height={stageSize.height}
                fill="white"
                shadowColor="black"
                shadowBlur={4}
                shadowOpacity={0.5}
              />
              {/* Scrubber handle */}
              <Rect
                x={scrubberX - 15}
                y={stageSize.height / 2 - 30}
                width={30}
                height={60}
                fill="white"
                cornerRadius={4}
                shadowColor="black"
                shadowBlur={4}
                shadowOpacity={0.3}
              />
              {/* Handle grip lines */}
              <Rect x={scrubberX - 6} y={stageSize.height / 2 - 15} width={2} height={30} fill="#999" />
              <Rect x={scrubberX - 1} y={stageSize.height / 2 - 15} width={2} height={30} fill="#999" />
              <Rect x={scrubberX + 4} y={stageSize.height / 2 - 15} width={2} height={30} fill="#999" />
            </Layer>
          </Stage>
        )}
      </Box>

      {/* Footer with image names */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        p: 1,
        borderTop: 1,
        borderColor: 'divider',
      }}>
        <Typography variant="caption" color="text.secondary">
          Left: {sourceMicrograph()?.name || 'Unknown'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Right: {matchingMicrographs.find(m => m.id === selectedMicrographId)?.name || 'Unknown'}
        </Typography>
      </Box>
    </Dialog>
  );
}
