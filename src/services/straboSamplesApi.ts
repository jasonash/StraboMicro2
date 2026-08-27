/**
 * StraboSamples API Service
 *
 * Client for the StraboSamples spine REST API (/samplesjwtdb/).
 * The spine is the central cross-system sample database: one canonical row
 * per sample, shared by StraboField, StraboMicro, and StraboExperimental.
 *
 * Linking mechanism: StraboMicro links a sample by adopting the spine sample's
 * canonical id as the local sample id. On project upload the server upserts the
 * spine under (id, user pkey), converging both apps on the same row. There is
 * no separate "link" API call; sharing the canonical id IS the link.
 *
 * Auth: same JWT infrastructure as /jwtdb/ (authenticatedFetch works as-is).
 * API conventions: all successes are HTTP 200; errors are {"Error": "..."}
 * (capital E); JSON bodies require Content-Type: application/json.
 */

import { authenticatedFetch, getAccessToken, useAuthStore } from '@/store/useAuthStore';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Spine-only entry returned by GET /mysamples (no JSONB, links, or children) */
export interface SpineSampleSummary {
  id: string;
  userpkey: number;
  name: string | null;
  igsn: string | null;
  description: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  display_sample_type: string | null;
  display_sample_purpose: string | null;
  parent_sample_id: string | null;
  parent_userpkey: number | null;
  created_at: string | null;
  created_by: number | null;
  modified_at: string | null;
  modified_by: number | null;
}

/** The Field samples[] sub-object, preserved verbatim in field_data (snake_case) */
export interface SpineFieldData {
  id?: string | number;
  sample_id_name?: string;
  label?: string;
  sample_description?: string;
  material_type?: string;
  other_material_type?: string;
  sample_type?: string;
  longitude?: number;
  latitude?: number;
  main_sampling_purpose?: string;
  other_sampling_purpose?: string;
  inplaceness_of_sample?: string;
  oriented_sample?: string;
  sample_orientation_notes?: string;
  sample_size?: string;
  degree_of_weathering?: string;
  sample_notes?: string;
  color?: string;
  lithology?: string;
  sample_unit?: string;
  Sample_IGSN?: string;
}

export interface SpineSubsystemLink {
  subsystem: 'field' | 'micro' | 'experimental';
  reference_id: string;
  reference_userpkey: number;
  reference_metadata: Record<string, unknown> | null;
  created_at: string | null;
  modified_at: string | null;
}

/** Full unified record returned by GET /sample/{id} */
export interface SpineSampleRecord extends SpineSampleSummary {
  field_data: SpineFieldData | null;
  micro_data: Record<string, unknown> | null;
  experimental_data: Record<string, unknown> | null;
  custom_data: Record<string, unknown> | null;
  subsystem_links: SpineSubsystemLink[];
}

// ============================================================================
// API CALLS
// ============================================================================

async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.Error === 'string') return body.Error;
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // Non-JSON body (e.g. Basic-auth plain-text "Unauthorized")
  }
  return `HTTP ${response.status}`;
}

/**
 * List all samples the user owns or collaborates on (spine fields only).
 * The list is complete; the endpoint has no pagination or filtering yet.
 */
export async function fetchMySamples(): Promise<SpineSampleSummary[]> {
  const url = `${getRestServerUrl()}/samplesjwtdb/mysamples`;
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load samples: ${await readApiError(response)}`);
  }
  const data = await response.json();
  return Array.isArray(data?.samples) ? data.samples : [];
}

/**
 * Fetch the full unified record for one sample the user owns.
 * (Collaborator-owned samples would need ?owner=, but the picker disables
 * those, so this client only ever fetches owned samples.)
 */
export async function fetchSample(id: string): Promise<SpineSampleRecord> {
  const url = `${getRestServerUrl()}/samplesjwtdb/sample/${encodeURIComponent(id)}`;
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load sample: ${await readApiError(response)}`);
  }
  return await response.json();
}

// ============================================================================
// FIELD-LINKAGE DETECTION
// ============================================================================

/**
 * A sample with a 'field' subsystem link is hosted by StraboField. For those,
 * the server's download overlay reasserts seven fields onto the project JSON
 * (name/label/sampleID, description, notes, lat, lng, material type, sampling
 * purpose) and a Micro upload cannot write them to the spine, so local edits
 * to them do not stick. The UI locks those fields with a hint instead.
 */
export function isFieldLinked(record: SpineSampleRecord): boolean {
  return (record.subsystem_links ?? []).some((link) => link.subsystem === 'field');
}

// ============================================================================
// SPINE STATUS: existence + linkage, with a session cache
// ============================================================================

export type SpineSubsystem = SpineSubsystemLink['subsystem'];

export const SUBSYSTEM_LABELS: Record<SpineSubsystem, string> = {
  field: 'StraboField',
  micro: 'StraboMicro',
  experimental: 'StraboExperimental',
};

/**
 * Answer to "does the spine have a row for this sample id, as the current
 * user?". Project upload auto-populates every sample into the spine, so a
 * sample can be 'found' without ever having been explicitly linked.
 * 'unknown' means the question could not be answered (offline, auth trouble);
 * callers should show nothing rather than guessing.
 */
export interface SpineStatusResult {
  status: 'found' | 'not-found' | 'unknown';
  fieldLinked: boolean;
  subsystems: SpineSubsystem[];
}

const UNKNOWN_SPINE_STATUS: SpineStatusResult = {
  status: 'unknown',
  fieldLinked: false,
  subsystems: [],
};

export function spineStatusFromRecord(record: SpineSampleRecord): SpineStatusResult {
  const subsystems = Array.from(
    new Set((record.subsystem_links ?? []).map((link) => link.subsystem))
  );
  return { status: 'found', fieldLinked: isFieldLinked(record), subsystems };
}

// Keyed by (user pkey, sample id) so an account switch never serves the other
// account's answers. 'unknown' results are never cached, so a check that
// failed offline recovers on the next attempt.
const spineStatusCache = new Map<string, SpineStatusResult>();
const spineStatusInFlight = new Map<string, Promise<SpineStatusResult>>();

function spineStatusKey(sampleId: string): string | null {
  const pkey = useAuthStore.getState().user?.pkey;
  return pkey ? `${pkey}:${sampleId}` : null;
}

/**
 * Drop cached answers: one sample's, or all of them (no argument).
 * Call the no-argument form after a successful project upload, since the
 * upload just auto-populated every sample and any cached 'not-found' is stale.
 */
export function invalidateSpineStatus(sampleId?: string): void {
  if (sampleId === undefined) {
    spineStatusCache.clear();
    return;
  }
  const key = spineStatusKey(sampleId);
  if (key) spineStatusCache.delete(key);
}

/**
 * Check whether the spine has a row for this sample id.
 * Reads on a nonexistent OR inaccessible sample both return 404 ("not found
 * for you"); either way there is nothing this user can view, so 404 maps to
 * 'not-found'. Never throws. Concurrent checks for the same id share one
 * request. `force` bypasses the cache for freshness-sensitive callers (the
 * field-lock check) but still updates it for cache-first callers.
 */
export async function checkSpineStatus(
  sampleId: string,
  options?: { force?: boolean }
): Promise<SpineStatusResult> {
  const key = spineStatusKey(sampleId);
  if (!key) return UNKNOWN_SPINE_STATUS; // logged out
  if (!options?.force) {
    const cached = spineStatusCache.get(key);
    if (cached) return cached;
  }
  const inFlight = spineStatusInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<SpineStatusResult> => {
    try {
      // Deliberately NOT authenticatedFetch: this is a passive check, and
      // authenticatedFetch prompts for login when the token is missing.
      // No silently available token -> 'unknown', never a login dialog.
      const token = await getAccessToken();
      if (!token) return UNKNOWN_SPINE_STATUS;
      const url = `${getRestServerUrl()}/samplesjwtdb/sample/${encodeURIComponent(sampleId)}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) {
        const result: SpineStatusResult = {
          status: 'not-found',
          fieldLinked: false,
          subsystems: [],
        };
        spineStatusCache.set(key, result);
        return result;
      }
      if (!response.ok) return UNKNOWN_SPINE_STATUS;
      const record: SpineSampleRecord = await response.json();
      const result = spineStatusFromRecord(record);
      spineStatusCache.set(key, result);
      return result;
    } catch {
      return UNKNOWN_SPINE_STATUS;
    } finally {
      spineStatusInFlight.delete(key);
    }
  })();
  spineStatusInFlight.set(key, promise);
  return promise;
}

// ============================================================================
// MAPPING: spine record -> local SampleMetadata fields
// ============================================================================

export interface MappedSpineSample {
  id: string;
  existsOnServer: boolean;
  sampleID?: string;
  igsn?: string;
  label?: string;
  sampleDescription?: string;
  materialType?: string;
  otherMaterialType?: string;
  sampleType?: string;
  longitude?: number;
  latitude?: number;
  mainSamplingPurpose?: string;
  otherSamplingPurpose?: string;
  inplacenessOfSample?: string;
  orientedSample?: string;
  sampleOrientationNotes?: string;
  sampleSize?: string;
  degreeOfWeathering?: string;
  sampleNotes?: string;
  color?: string;
  lithology?: string;
  sampleUnit?: string;
}

/**
 * Map a spine record to local SampleMetadata fields.
 * Spine columns are authoritative for the common fields; the Field-only extras
 * come from field_data (the Field sample object preserved verbatim).
 */
export function mapSpineSampleToLocal(record: SpineSampleRecord): MappedSpineSample {
  const fd = record.field_data ?? {};
  return {
    // CRITICAL: Preserve the canonical id exactly - sharing it IS the link
    id: String(record.id),
    existsOnServer: true,

    sampleID: record.name ?? fd.sample_id_name ?? undefined,
    igsn: record.igsn ?? fd.Sample_IGSN ?? undefined,
    label: fd.label,
    sampleDescription: record.description ?? fd.sample_description ?? undefined,
    sampleNotes: record.notes ?? fd.sample_notes ?? undefined,
    longitude: record.longitude ?? fd.longitude ?? undefined,
    latitude: record.latitude ?? fd.latitude ?? undefined,
    materialType: record.display_sample_type ?? fd.material_type ?? undefined,
    otherMaterialType: fd.other_material_type,
    mainSamplingPurpose: record.display_sample_purpose ?? fd.main_sampling_purpose ?? undefined,
    otherSamplingPurpose: fd.other_sampling_purpose,

    // Field-only extras (undefined when the sample has no Field data)
    sampleType: fd.sample_type,
    inplacenessOfSample: fd.inplaceness_of_sample,
    orientedSample: fd.oriented_sample,
    sampleOrientationNotes: fd.sample_orientation_notes,
    sampleSize: fd.sample_size,
    degreeOfWeathering: fd.degree_of_weathering,
    color: fd.color,
    lithology: fd.lithology,
    sampleUnit: fd.sample_unit,
  };
}

// ============================================================================
// FORM HELPERS
// ============================================================================

/**
 * Normalized sample vocabularies (shared by Field and Micro; the spine's
 * display_sample_type / display_sample_purpose use the same values).
 * Keys are the stored values; labels are for display.
 */
export const SAMPLE_MATERIAL_TYPE_LABELS: Record<string, string> = {
  intact_rock: 'Intact Rock',
  fragmented_roc: 'Fragmented Rock',
  sediment: 'Sediment',
  tephra: 'Tephra',
  carbon_or_animal: 'Carbon or Animal',
  other: 'Other',
};

export const SAMPLE_PURPOSE_LABELS: Record<string, string> = {
  fabric___micro: 'Fabric / Microstructure',
  petrology: 'Petrology',
  geochronology: 'Geochronology',
  geochemistry: 'Geochemistry',
  active_eruptio: 'Active Eruption',
  other: 'Other',
};

export const VALID_MATERIAL_TYPES = Object.keys(SAMPLE_MATERIAL_TYPE_LABELS);
export const VALID_SAMPLING_PURPOSES = Object.keys(SAMPLE_PURPOSE_LABELS);

/**
 * Split a server value into (dropdownValue, otherText) for a select that has
 * an 'other' escape hatch. A value outside the known vocabulary is presented
 * as 'other' with the raw value in the free-text field.
 */
export function splitSelectValue(
  serverValue: string | undefined,
  serverOtherValue: string | undefined,
  validValues: readonly string[]
): { value: string; otherValue: string } {
  const value = serverValue ?? '';
  if (!value) return { value: '', otherValue: '' };
  if (validValues.includes(value)) {
    return { value, otherValue: value === 'other' ? serverOtherValue ?? '' : '' };
  }
  return { value: 'other', otherValue: value };
}
