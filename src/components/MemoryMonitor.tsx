/**
 * MemoryMonitor Component
 *
 * Real-time memory usage display for debugging OOM issues.
 * Shows both renderer (JS heap) and main process memory.
 * Toggle visibility via Debug menu.
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { Memory } from '@mui/icons-material';

interface MemoryInfo {
  renderer: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  main: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

// Format bytes to human readable
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
};

// Get color based on memory pressure
const getMemoryColor = (used: number, total: number): string => {
  const ratio = used / total;
  if (ratio < 0.6) return '#4caf50'; // Green
  if (ratio < 0.8) return '#ff9800'; // Orange
  return '#f44336'; // Red
};

export const MemoryMonitor = () => {
  const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null);
  const [isVisible, setIsVisible] = useState(() => {
    const saved = localStorage.getItem('memoryMonitorVisible');
    return saved ? JSON.parse(saved) : false;
  });

  const updateMemory = useCallback(async () => {
    try {
      // Get renderer memory (from browser's performance API)
      const rendererMemory = (performance as any).memory;

      // Get main process memory
      const mainMemory = await window.api?.getMemoryInfo();

      if (rendererMemory && mainMemory) {
        setMemoryInfo({
          renderer: {
            usedJSHeapSize: rendererMemory.usedJSHeapSize,
            totalJSHeapSize: rendererMemory.totalJSHeapSize,
            jsHeapSizeLimit: rendererMemory.jsHeapSizeLimit,
          },
          main: mainMemory.main,
        });
      }
    } catch (error) {
      console.error('[MemoryMonitor] Error getting memory info:', error);
    }
  }, []);

  // Listen for toggle event from menu
  useEffect(() => {
    const unsubscribe = window.api?.onDebugToggleMemoryMonitor?.(() => {
      setIsVisible((prev: boolean) => {
        const newValue = !prev;
        localStorage.setItem('memoryMonitorVisible', JSON.stringify(newValue));
        return newValue;
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  // Update memory info periodically when visible
  useEffect(() => {
    if (!isVisible) return;

    // Initial update
    updateMemory();

    // Update every second
    const interval = setInterval(updateMemory, 1000);

    return () => clearInterval(interval);
  }, [isVisible, updateMemory]);

  if (!isVisible || !memoryInfo) return null;

  const rendererColor = getMemoryColor(
    memoryInfo.renderer.usedJSHeapSize,
    memoryInfo.renderer.jsHeapSizeLimit
  );
  const mainColor = getMemoryColor(
    memoryInfo.main.heapUsed,
    memoryInfo.main.heapTotal
  );

  const tooltipContent = (
    <Box sx={{ p: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>
        Renderer Process
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        JS Heap: {formatBytes(memoryInfo.renderer.usedJSHeapSize)} / {formatBytes(memoryInfo.renderer.totalJSHeapSize)}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        Limit: {formatBytes(memoryInfo.renderer.jsHeapSizeLimit)}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mt: 1 }}>
        Main Process
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        Heap: {formatBytes(memoryInfo.main.heapUsed)} / {formatBytes(memoryInfo.main.heapTotal)}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        RSS: {formatBytes(memoryInfo.main.rss)}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <Box
        sx={{
          position: 'fixed',
          bottom: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          px: 1.5,
          py: 0.5,
          zIndex: 9999,
          opacity: 0.9,
          '&:hover': {
            opacity: 1,
          },
        }}
      >
        <Memory sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Typography
            variant="caption"
            sx={{ fontFamily: 'monospace', color: rendererColor }}
          >
            R: {formatBytes(memoryInfo.renderer.usedJSHeapSize)}
          </Typography>
          <Typography
            variant="caption"
            sx={{ fontFamily: 'monospace', color: mainColor }}
          >
            M: {formatBytes(memoryInfo.main.rss)}
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
};
