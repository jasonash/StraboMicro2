/**
 * Grain Spot engine (docs/click-a-grain-design.md): the model download, the
 * worker (samWorker.ts) and what the tool shows while it works. The viewer
 * hands it the view on screen (prepareView) after every pan or zoom and asks
 * for a grain's outline at a click (outlineAt). Only the newest view counts:
 * a view that changes while one is being analyzed replaces it.
 */

import { create } from 'zustand';
import { ortWasmPaths, ortThreads } from '@/services/ortWasm';
import { E2E } from '@/services/e2eMode';
import type { GrainOutline, Point } from '@/utils/grainOutline';
import type { SamBackend, SamRequest, SamResponse } from './samWorker';

export type GrainSpotPhase =
  | 'idle' // tool not used yet
  | 'needs-download' // the model is not on this computer
  | 'downloading'
  | 'loading' // model into the worker
  | 'preparing' // analyzing the view
  | 'ready' // click a grain
  | 'error';

interface GrainSpotState {
  phase: GrainSpotPhase;
  /** Download percent */
  percent: number;
  /** Size of the model download, for the prompt */
  totalBytes: number;
  error: string | null;
  /** A short note for the status line (e.g. "The grain runs off the screen...") */
  note: string | null;
  /** How long the last view analysis took, ms (shown in the status line tooltip) */
  lastPrepareMs: number | null;
  /** Where views are analyzed: on the GPU (WebGPU) or the CPU */
  backend: SamBackend | null;
  /** The model is in the worker: views can be analyzed */
  modelLoaded: boolean;
  /** Outline of the grain under the mouse, in image coordinates (null: none shown) */
  preview: { ring: Array<[number, number]>; offScreen: boolean } | null;
}

export const useGrainSpotStore = create<GrainSpotState>()(() => ({
  phase: 'idle',
  percent: 0,
  totalBytes: 0,
  error: null,
  note: null,
  lastPrepareMs: null,
  backend: null,
  modelLoaded: false,
  preview: null,
}));

const setState = (patch: Partial<GrainSpotState>) => useGrainSpotStore.setState(patch);

/** A view handed to the model: pixels plus how they map back onto the screen */
export interface ViewCapture {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

let worker: Worker | null = null;
let starting: Promise<boolean> | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (r: SamResponse) => void; reject: (e: Error) => void }>();

/** The view the worker holds (encoded) and the one it is encoding */
let readyViewId = 0;
let encodingViewId = 0;
let nextViewId = 1;
/** A view waiting until the current analysis finishes (only the newest is kept) */
let queued: { viewId: number; capture: ViewCapture } | null = null;
const viewWaiters = new Map<number, Array<(ok: boolean) => void>>();

function send(request: SamRequest, transfer: Transferable[] = []): Promise<SamResponse> {
  const w = worker;
  if (!w) return Promise.reject(new Error('The grain model is not loaded'));
  return new Promise((resolve, reject) => {
    pending.set(request.id, { resolve, reject });
    w.postMessage(request, transfer);
  });
}

function onMessage(event: MessageEvent<SamResponse>) {
  const message = event.data;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.type === 'error') waiter.reject(new Error(message.message));
  else waiter.resolve(message);
}

/** The model is in the worker and views can be analyzed */
export function isLoaded(): boolean {
  return worker !== null && useGrainSpotStore.getState().modelLoaded;
}

/** Is the model on this computer? Sets needs-download when not. */
export async function checkModel(): Promise<boolean> {
  const api = window.api?.grainSpot;
  if (!api) return false;
  const status = await api.status();
  setState({ totalBytes: status.totalBytes });
  if (!status.available && useGrainSpotStore.getState().phase !== 'downloading') setState({ phase: 'needs-download' });
  return status.available;
}

/** Download the model (the prompt's Download button), then load it */
export async function downloadModel(): Promise<boolean> {
  const api = window.api?.grainSpot;
  if (!api) return false;
  setState({ phase: 'downloading', percent: 0, error: null });
  const off = api.onDownloadProgress((p) => setState({ percent: p.percent }));
  try {
    const result = await api.download();
    if (!result.success) {
      setState({ phase: 'error', error: result.error ?? 'The download failed' });
      return false;
    }
  } finally {
    off();
  }
  return start();
}

/** Load the model into the worker (once); false when it is not downloaded or fails */
export function start(): Promise<boolean> {
  if (worker && !starting) return Promise.resolve(true);
  if (starting) return starting;
  starting = (async () => {
    const api = window.api?.grainSpot;
    if (!api || !(await checkModel())) return false;
    setState({ phase: 'loading', error: null });
    const bytes = await api.load();
    if (!bytes.success || !bytes.encoder || !bytes.encoderData || !bytes.decoder || !bytes.decoderData || !bytes.names) {
      setState({ phase: 'error', error: bytes.error ?? 'Could not read the grain model' });
      return false;
    }
    const w = new Worker(new URL('./samWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = onMessage;
    w.onerror = (event) => {
      console.error('[GrainSpot] Worker error:', event.message);
      setState({ phase: 'error', error: event.message || 'The grain model stopped' });
    };
    worker = w;
    try {
      const model = { encoder: bytes.encoder, encoderData: bytes.encoderData, decoder: bytes.decoder, decoderData: bytes.decoderData, names: bytes.names };
      // samWorker imports onnxruntime-web/webgpu, which loads the asyncify files
      const r = await send({ type: 'init', id: nextRequestId++, model, wasmPaths: ortWasmPaths('asyncify'), numThreads: ortThreads(), useGpu: !E2E?.grainCpu });
      if (r.type === 'init') {
        console.log(`[GrainSpot] Model loaded in ${Math.round(r.ms)} ms (${r.backend === 'webgpu' ? 'GPU' : `CPU, ${ortThreads()} threads`})`);
        setState({ backend: r.backend });
      }
      setState({ phase: 'idle', modelLoaded: true });
      return true;
    } catch (error) {
      w.terminate();
      worker = null;
      setState({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  })().finally(() => {
    starting = null;
  });
  return starting;
}

function settleView(viewId: number, ok: boolean) {
  const waiters = viewWaiters.get(viewId);
  viewWaiters.delete(viewId);
  waiters?.forEach((resolve) => resolve(ok));
}

async function encodeNext(viewId: number, capture: ViewCapture): Promise<void> {
  encodingViewId = viewId;
  setState({ phase: 'preparing', note: null });
  try {
    const r = await send({ type: 'encode', id: nextRequestId++, viewId, rgba: capture.rgba, width: capture.width, height: capture.height }, [capture.rgba.buffer]);
    if (r.type === 'encode') {
      readyViewId = viewId;
      setState({ lastPrepareMs: Math.round(r.ms), backend: r.backend });
      console.log(`[GrainSpot] View ${capture.width}x${capture.height} analyzed in ${Math.round(r.ms)} ms (${r.backend === 'webgpu' ? 'GPU' : 'CPU'})`);
    }
    settleView(viewId, true);
  } catch (error) {
    settleView(viewId, false);
    setState({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
  } finally {
    encodingViewId = 0;
  }
  const next = queued;
  queued = null;
  if (next) await encodeNext(next.viewId, next.capture);
  else if (useGrainSpotStore.getState().phase === 'preparing') setState({ phase: 'ready' });
}

/**
 * Analyze this view (the pixels on screen). Returns its id for outlineAt.
 * A view handed over while another is being analyzed waits; a newer one replaces it.
 */
export function prepareView(capture: ViewCapture): number {
  const viewId = nextViewId++;
  if (!worker) return viewId;
  if (encodingViewId) {
    if (queued) settleView(queued.viewId, false);
    queued = { viewId, capture };
    setState({ phase: 'preparing' });
  } else {
    void encodeNext(viewId, capture);
  }
  return viewId;
}

/** Wait until a view is analyzed: false when it was replaced or failed */
function viewReady(viewId: number): Promise<boolean> {
  if (readyViewId === viewId) return Promise.resolve(true);
  if (encodingViewId !== viewId && queued?.viewId !== viewId) return Promise.resolve(false);
  return new Promise((resolve) => {
    const list = viewWaiters.get(viewId) ?? [];
    list.push(resolve);
    viewWaiters.set(viewId, list);
  });
}

/** A newer view replaced this one before its outline was made: ask again in the newest */
export class ViewReplacedError extends Error {
  constructor() {
    super('The view was replaced by a newer one');
    this.name = 'ViewReplacedError';
  }
}

/** The worker's answer when it holds a newer view than the one asked about (samWorker.ts outline) */
const WORKER_VIEW_GONE = 'This view has not been analyzed';

/**
 * The outline of the grain at click (view pixels) in this view, waiting for
 * its analysis if needed. Extra points refine it: label 1 includes, 0 excludes.
 * null: nothing there. Throws ViewReplacedError when a newer view replaced it
 * meanwhile (e.g. tiles arrived after a zoom and the view was analyzed again).
 */
export async function outlineAt(viewId: number, click: Point, extra: Array<{ point: Point; label: 0 | 1 }> = []): Promise<GrainOutline | null> {
  if (!(await viewReady(viewId))) throw new ViewReplacedError();
  const points: Point[] = [click, ...extra.map((e) => e.point)];
  const labels = [1, ...extra.map((e) => e.label)];
  try {
    const r = await send({ type: 'outline', id: nextRequestId++, viewId, points, labels, click });
    return r.type === 'outline' ? r.outline : null;
  } catch (error) {
    if (error instanceof Error && error.message === WORKER_VIEW_GONE) throw new ViewReplacedError();
    throw error;
  }
}

export function setNote(note: string | null): void {
  if (useGrainSpotStore.getState().note !== note) setState({ note });
}

export function setPreview(preview: GrainSpotState['preview']): void {
  if (preview !== null || useGrainSpotStore.getState().preview !== null) setState({ preview });
}

/** The tool was put down: forget the view (the model stays loaded for next time) */
export function releaseView(): void {
  queued = null;
  readyViewId = 0;
  setPreview(null);
  if (useGrainSpotStore.getState().phase === 'ready' || useGrainSpotStore.getState().phase === 'preparing') setState({ phase: 'idle', note: null });
}
