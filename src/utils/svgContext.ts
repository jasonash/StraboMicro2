/**
 * A drawing context that records SVG instead of pixels, for the Grain Size
 * charts (Jason, 2026-11-23: download the graphs as raster or SVG).
 *
 * The chart drawing functions (drawSizeHistogram, drawRoseDiagram) take a
 * ChartContext: the few canvas calls they use. A real canvas context is one;
 * SvgContext is the other, so one drawing gives the screen, the PNG, the PDF
 * and the SVG. Each shape keeps the transform it was drawn under, so rotated
 * text and arcs come out as they look on the canvas. Colors with transparency
 * become a color plus an opacity (rgba() and 8-digit hex are not read by every
 * vector editor). Text stays text, in Helvetica/Arial, so it can be edited.
 */

/** The canvas calls the charts use */
export interface ChartContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  setLineDash(segments: number[]): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
}

type Matrix = [number, number, number, number, number, number];

interface State {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  dash: number[];
  matrix: Matrix;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** a then b (b applied after a's frame: canvas order, new = current x op) */
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** A number for an attribute: short, no exponent, no -0 */
export function num(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A CSS color as an SVG color and opacity: #rgb, #rrggbb, #rrggbbaa, rgb(),
 * rgba(); anything else (a name) is passed through with opacity 1.
 */
export function svgColor(css: string): { color: string; opacity: number } {
  const c = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) return { color: `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase(), opacity: 1 };
    if (h.length === 6) return { color: `#${h}`.toLowerCase(), opacity: 1 };
    return { color: `#${h.slice(0, 6)}`.toLowerCase(), opacity: Math.round((parseInt(h.slice(6), 16) / 255) * 1000) / 1000 };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (rgb) {
    const to2 = (v: string) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0');
    const opacity = rgb[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgb[4])));
    return { color: `#${to2(rgb[1])}${to2(rgb[2])}${to2(rgb[3])}`, opacity };
  }
  return { color: c, opacity: 1 };
}

/** A canvas font ("bold 13px system-ui, sans-serif") as SVG font attributes */
export function svgFont(font: string): string {
  const size = /([\d.]+)px/.exec(font)?.[1] ?? '10';
  const bold = /\bbold\b|\b[6-9]00\b/.test(font);
  const italic = /\bitalic\b/.test(font);
  return `font-family="Helvetica, Arial, sans-serif" font-size="${num(Number(size))}"` +
    (bold ? ' font-weight="bold"' : '') + (italic ? ' font-style="italic"' : '');
}

const ANCHOR: Record<CanvasTextAlign, string> = {
  left: 'start', start: 'start', center: 'middle', right: 'end', end: 'end',
};

export class SvgContext implements ChartContext {
  private state: State = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, font: '10px sans-serif',
    textAlign: 'start', dash: [], matrix: IDENTITY,
  };
  private stack: State[] = [];
  private path = '';
  /** Current point of the path (for arc's joining line), in user space */
  private hasPoint = false;
  private readonly elements: string[] = [];

  get fillStyle(): string { return this.state.fillStyle; }
  set fillStyle(v: string | CanvasGradient | CanvasPattern) { if (typeof v === 'string') this.state.fillStyle = v; }
  get strokeStyle(): string { return this.state.strokeStyle; }
  set strokeStyle(v: string | CanvasGradient | CanvasPattern) { if (typeof v === 'string') this.state.strokeStyle = v; }
  get lineWidth(): number { return this.state.lineWidth; }
  set lineWidth(v: number) { if (Number.isFinite(v) && v > 0) this.state.lineWidth = v; }
  get font(): string { return this.state.font; }
  set font(v: string) { this.state.font = v; }
  get textAlign(): CanvasTextAlign { return this.state.textAlign; }
  set textAlign(v: CanvasTextAlign) { this.state.textAlign = v; }

  save(): void { this.stack.push({ ...this.state, dash: [...this.state.dash] }); }
  restore(): void { const s = this.stack.pop(); if (s) this.state = s; }
  translate(x: number, y: number): void { this.state.matrix = multiply(this.state.matrix, [1, 0, 0, 1, x, y]); }
  rotate(angle: number): void {
    const c = Math.cos(angle), s = Math.sin(angle);
    this.state.matrix = multiply(this.state.matrix, [c, s, -s, c, 0, 0]);
  }
  setLineDash(segments: number[]): void { this.state.dash = segments.filter((v) => Number.isFinite(v) && v >= 0); }

  /** The background is the SVG's own; clearing draws nothing */
  clearRect(): void {}

  fillRect(x: number, y: number, w: number, h: number): void {
    this.elements.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${this.paint('fill')}${this.transform()}/>`);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.elements.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="none"${this.paint('stroke')}${this.transform()}/>`);
  }

  beginPath(): void { this.path = ''; this.hasPoint = false; }
  moveTo(x: number, y: number): void { this.path += `M${num(x)} ${num(y)}`; this.hasPoint = true; }
  lineTo(x: number, y: number): void {
    this.path += `${this.hasPoint ? 'L' : 'M'}${num(x)} ${num(y)}`;
    this.hasPoint = true;
  }
  closePath(): void { if (this.path) this.path += 'Z'; }

  arc(x: number, y: number, r: number, start: number, end: number, ccw = false): void {
    const sx = x + r * Math.cos(start), sy = y + r * Math.sin(start);
    this.path += `${this.hasPoint ? 'L' : 'M'}${num(sx)} ${num(sy)}`;
    this.hasPoint = true;
    // Sweep as canvas does: clockwise (positive) unless ccw; a full turn or more is a circle
    let sweep = ccw ? start - end : end - start;
    const full = 2 * Math.PI;
    if (sweep >= full - 1e-9) {
      const mx = x - r * Math.cos(start), my = y - r * Math.sin(start);
      const flag = ccw ? 0 : 1;
      this.path += `A${num(r)} ${num(r)} 0 1 ${flag} ${num(mx)} ${num(my)}A${num(r)} ${num(r)} 0 1 ${flag} ${num(sx)} ${num(sy)}`;
      return;
    }
    sweep = ((sweep % full) + full) % full;
    if (sweep === 0) return;
    const ex = x + r * Math.cos(end), ey = y + r * Math.sin(end);
    this.path += `A${num(r)} ${num(r)} 0 ${sweep > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${num(ex)} ${num(ey)}`;
  }

  fill(): void {
    if (!this.path) return;
    this.elements.push(`<path d="${this.path}"${this.paint('fill')}${this.transform()}/>`);
  }

  stroke(): void {
    if (!this.path) return;
    this.elements.push(`<path d="${this.path}" fill="none"${this.paint('stroke')}${this.transform()}/>`);
  }

  fillText(text: string, x: number, y: number): void {
    this.elements.push(`<text x="${num(x)}" y="${num(y)}" ${svgFont(this.state.font)} text-anchor="${ANCHOR[this.state.textAlign]}"${this.paint('fill')}${this.transform()}>${escapeXml(text)}</text>`);
  }

  /** A halo behind text (the rose's ring labels) */
  strokeText(text: string, x: number, y: number): void {
    this.elements.push(`<text x="${num(x)}" y="${num(y)}" ${svgFont(this.state.font)} text-anchor="${ANCHOR[this.state.textAlign]}" fill="none" stroke-linejoin="round"${this.paint('stroke')}${this.transform()}>${escapeXml(text)}</text>`);
  }

  /** The SVG document, width x height user units, on a background when given */
  toSvg(width: number, height: number, background: string | null = '#ffffff', title?: string): string {
    const bg = background ? `<rect width="${num(width)}" height="${num(height)}"${(() => {
      const c = svgColor(background);
      return ` fill="${c.color}"${c.opacity < 1 ? ` fill-opacity="${c.opacity}"` : ''}`;
    })()}/>\n` : '';
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}">\n` +
      (title ? `<title>${escapeXml(title)}</title>\n` : '') +
      bg + this.elements.join('\n') + '\n</svg>\n';
  }

  private transform(): string {
    const m = this.state.matrix;
    if (m.every((v, i) => v === IDENTITY[i])) return '';
    if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) return ` transform="translate(${num(m[4])} ${num(m[5])})"`;
    return ` transform="matrix(${m.map(num).join(' ')})"`;
  }

  private paint(kind: 'fill' | 'stroke'): string {
    const c = svgColor(kind === 'fill' ? this.state.fillStyle : this.state.strokeStyle);
    let out = ` ${kind}="${escapeXml(c.color)}"`;
    if (c.opacity < 1) out += ` ${kind}-opacity="${c.opacity}"`;
    if (kind === 'stroke') {
      out += ` stroke-width="${num(this.state.lineWidth)}"`;
      if (this.state.dash.length > 0) out += ` stroke-dasharray="${this.state.dash.map(num).join(' ')}"`;
    }
    return out;
  }
}
