/**
 * The size histogram's drawing, without React: shared by the SizeHistogram
 * component, the PDF and the PNG/SVG downloads (src/services/grainCharts.ts).
 */

import { getClassificationScheme, generateHistogramBins } from '@/services/grainAnalysis/statistics';
import { countAxis, niceTicks, sizeTickLabels } from '@/utils/countTicks';
import type { ChartContext } from '@/utils/svgContext';

// Colors for the histogram bars (same in both themes)
const BAR_COLOR = 'rgba(66, 133, 244, 0.8)';
const BAR_STROKE_COLOR = 'rgba(25, 118, 210, 1)';

/** Text and line colors of a chart (the bars keep their own colors) */
export interface HistogramColors {
  textColor: string;
  axisColor: string;
  gridColor: string;
}

/** Print colors (light background), for the PDF export */
export const HISTOGRAM_PRINT_COLORS: HistogramColors = {
  textColor: '#333',
  axisColor: 'rgba(0, 0, 0, 0.7)',
  gridColor: 'rgba(0, 0, 0, 0.15)',
};

/**
 * Draw the histogram in a width x height box of the context (already scaled
 * for the device), or an SvgContext. Shared by the component, the PDF and the downloads.
 */
export function drawSizeHistogram(
  ctx: ChartContext,
  {
    width,
    height,
    bins,
    classification,
    useLogScale,
    showGrid,
    title,
    colors,
  }: {
    width: number;
    height: number;
    bins: ReturnType<typeof generateHistogramBins>;
    classification: ReturnType<typeof getClassificationScheme>;
    useLogScale: boolean;
    showGrid: boolean;
    title?: string;
    colors: HistogramColors;
  }
): void {
  const { textColor, axisColor, gridColor } = colors;
  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Margins for axes
  const margin = { top: 30, right: 32, bottom: 50, left: 60 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  if (bins.length === 0) {
    ctx.fillStyle = textColor;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data to display', width / 2, height / 2);
    return;
  }

  // Calculate scales
  const xMin = bins[0].min;
  const xMax = bins[bins.length - 1].max;
  // Counts are whole numbers, so the axis ticks are too (1, 2 or 5 x 10^k apart, about five
  // of them). Before, the top was 1.1 x the largest count split into five equal steps with
  // rounded labels, so a 1-grain bar sat on the line labelled "2".
  const { yMax, yStep } = countAxis(Math.max(...bins.map(b => b.count)));

  // Transform functions
  const xScale = (v: number): number => {
    if (useLogScale && xMin > 0) {
      const logMin = Math.log10(xMin);
      const logMax = Math.log10(xMax);
      return margin.left + ((Math.log10(v) - logMin) / (logMax - logMin)) * plotWidth;
    }
    return margin.left + ((v - xMin) / (xMax - xMin)) * plotWidth;
  };

  const yScale = (v: number): number => {
    return margin.top + plotHeight - (v / yMax) * plotHeight;
  };

  // Draw classification scale background
  ctx.save();
  for (const cls of classification.classes) {
    const clsXMin = Math.max(cls.sizeMinMicrons, xMin);
    const clsXMax = Math.min(cls.sizeMaxMicrons === Infinity ? xMax : cls.sizeMaxMicrons, xMax);

    if (clsXMax <= xMin || clsXMin >= xMax) continue;

    const x1 = xScale(clsXMin);
    const x2 = xScale(clsXMax);

    ctx.fillStyle = cls.color + '40'; // 25% opacity
    ctx.fillRect(x1, margin.top, x2 - x1, plotHeight);

    // Draw label at top
    if (x2 - x1 > 30) {
      ctx.fillStyle = textColor;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate((x1 + x2) / 2, margin.top + 12);
      ctx.fillText(cls.name, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();

  // Draw grid
  if (showGrid) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let value = 0; value <= yMax; value += yStep) {
      const y = yScale(value);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
    }
  }

  // Draw histogram bars
  for (const bin of bins) {
    const x1 = xScale(bin.min);
    const x2 = xScale(bin.max);
    const y1 = yScale(bin.count);
    const y2 = yScale(0);
    const barWidth = x2 - x1;
    const barHeight = y2 - y1;

    if (barHeight > 0) {
      ctx.fillStyle = BAR_COLOR;
      ctx.fillRect(x1, y1, barWidth - 1, barHeight);
      ctx.strokeStyle = BAR_STROKE_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, y1, barWidth - 1, barHeight);
    }
  }

  // Draw axes
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, height - margin.bottom);
  ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.stroke();

  // X-axis labels
  ctx.fillStyle = textColor;
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';

  // Create tick values
  const tickCount = 6;
  const tickValues: number[] = [];
  if (useLogScale && xMin > 0) {
    const logMin = Math.log10(xMin);
    const logMax = Math.log10(xMax);
    for (let i = 0; i <= tickCount; i++) {
      tickValues.push(Math.pow(10, logMin + (i / tickCount) * (logMax - logMin)));
    }
  } else {
    // Round values (e.g. 200, 400, 600 µm or 1.14, 1.16 mm), not equal splits of the range
    tickValues.push(...niceTicks(xMin, xMax, tickCount));
  }
  const tickLabels = sizeTickLabels(tickValues);

  tickValues.forEach((tickValue, i) => {
    const x = xScale(tickValue);

    // Tick mark
    ctx.beginPath();
    ctx.moveTo(x, height - margin.bottom);
    ctx.lineTo(x, height - margin.bottom + 5);
    ctx.stroke();

    // Label
    ctx.fillText(tickLabels[i], x, height - margin.bottom + 18);
  });

  // X-axis title
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('Equivalent Diameter', width / 2, height - 5);

  // Y-axis labels
  ctx.textAlign = 'right';
  for (let value = 0; value <= yMax; value += yStep) {
    const y = yScale(value);

    // Tick mark
    ctx.beginPath();
    ctx.moveTo(margin.left - 5, y);
    ctx.lineTo(margin.left, y);
    ctx.stroke();

    // Label
    ctx.fillText(value.toString(), margin.left - 8, y + 4);
  }

  // Y-axis title
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('Count', 0, 0);
  ctx.restore();

  // Title
  if (title) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 15);
  }
}
