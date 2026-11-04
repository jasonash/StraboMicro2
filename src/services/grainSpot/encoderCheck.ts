/**
 * Grain Spot GPU self-check (docs/click-a-grain-design.md): when the image
 * encoder runs on the GPU, the worker first analyzes a small built-in test
 * image and compares a few hundred of the encoder's output values with the
 * ones the CPU gives (EXPECTED, written by tests/grainEncoderCheck.mts). A
 * GPU or driver that gives wrong numbers without an error would otherwise
 * make bad outlines silently; on a mismatch the worker uses the CPU instead.
 *
 * Pure (no onnxruntime, no DOM), so the worker and the Node test share it.
 * EXPECTED belongs to the fp32 encoder of electron/grainSpotModel.js and to
 * pixelValues below: when either changes, run
 *   node tests/grainEncoderCheck.mts --write
 * and paste its output here.
 */

/** The model's input is a square of this many pixels; the view is stretched onto it */
export const INPUT = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** RGBA view pixels -> normalized CHW floats of INPUT x INPUT, bilinear (the encoder's pixel_values) */
export function pixelValues(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(3 * INPUT * INPUT);
  const plane = INPUT * INPUT;
  const sx = width / INPUT;
  const sy = height / INPUT;
  for (let y = 0; y < INPUT; y++) {
    const v = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), height - 1);
    const y0 = Math.floor(v);
    const y1 = Math.min(y0 + 1, height - 1);
    const fy = v - y0;
    for (let x = 0; x < INPUT; x++) {
      const u = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), width - 1);
      const x0 = Math.floor(u);
      const x1 = Math.min(x0 + 1, width - 1);
      const fx = u - x0;
      const i00 = (y0 * width + x0) * 4;
      const i01 = (y0 * width + x1) * 4;
      const i10 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const value = (rgba[i00 + c] * (1 - fx) + rgba[i01 + c] * fx) * (1 - fy) + (rgba[i10 + c] * (1 - fx) + rgba[i11 + c] * fx) * fy;
        out[c * plane + y * INPUT + x] = (value / 255 - MEAN[c]) / STD[c];
      }
    }
  }
  return out;
}

/** The test image: grains as discs of different colours with dark rims on a brown ground (always the same) */
export function checkImage(): { rgba: Uint8ClampedArray; width: number; height: number } {
  const width = 256;
  const height = 192;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const discs = [
    { x: 70, y: 60, r: 40, c: [216, 176, 144] },
    { x: 170, y: 70, r: 50, c: [90, 140, 200] },
    { x: 110, y: 140, r: 35, c: [200, 60, 150] },
    { x: 205, y: 150, r: 30, c: [230, 220, 90] },
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = [58 + ((x * 3 + y * 5) % 17), 53, 48];
      for (const d of discs) {
        const r = Math.hypot(x - d.x, y - d.y);
        if (r <= d.r) c = r > d.r - 3 ? [30, 30, 30] : d.c;
      }
      const i = (y * width + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = 255;
    }
  }
  return { rgba, width, height };
}

/** How many values are compared per encoder output */
const SAMPLES = 128;

/** Evenly spread values of one output (the same positions every time) */
export function sample(data: ArrayLike<number>): number[] {
  const out: number[] = [];
  const step = Math.max(1, Math.floor(data.length / SAMPLES));
  for (let i = 0; i < SAMPLES && i * step < data.length; i++) out.push(Number(data[i * step]));
  return out;
}

/**
 * The largest relative difference (L2 of the difference over L2 of the
 * expected values) over the outputs; Infinity when an output is missing,
 * has a different length or holds a non-number.
 */
export function difference(actual: Record<string, ArrayLike<number>>, expected: Record<string, number[]>): number {
  let worst = 0;
  for (const [name, want] of Object.entries(expected)) {
    const data = actual[name];
    if (!data) return Infinity;
    const got = sample(data);
    if (got.length !== want.length) return Infinity;
    let diff = 0;
    let norm = 0;
    for (let i = 0; i < want.length; i++) {
      if (!Number.isFinite(got[i])) return Infinity;
      diff += (got[i] - want[i]) ** 2;
      norm += want[i] ** 2;
    }
    worst = Math.max(worst, Math.sqrt(diff) / Math.max(Math.sqrt(norm), 1e-9));
  }
  return worst;
}

/** Above this the GPU is not trusted (a correct GPU differs from the CPU by far less; see tests/grainEncoderCheck.mts) */
export const MAX_DIFFERENCE = 0.05;

/** The CPU's values for the test image (fp32 encoder; written by tests/grainEncoderCheck.mts --write) */
export const EXPECTED: Record<string, number[]> = {
  'image_embeddings.0': [0.18713, 0.17261, 0.17184, 0.17333, 0.0406, 0.00716, -0.00016, 0.00041, 0.13595, 0.13482, 0.12222, 0.12908, 0.08195, 0.03098, 0.0236, 0.02523, 0.07706, 0.26687, 0.24696, 0.28241, 0.05738, 0.07271, 0.09329, 0.10525, 0.02535, 0.01956, 0.01722, 0.01462, -0.02635, -0.05956, -0.06479, -0.0597, 0.12878, 0.09173, 0.0849, 0.08716, 0.10822, 0.08301, 0.07703, 0.0695, 0.21956, 0.15146, 0.12054, 0.14315, -0.05723, -0.05608, -0.04708, -0.05419, 0.16196, -0.02257, -0.02383, -0.03093, 0.30514, 0.11206, 0.10297, 0.05644, 0.08934, 0.00583, 0.00146, 0.00093, 0.06536, 0.12545, 0.11968, 0.12101, 0.02614, -0.05517, -0.06356, -0.06246, -0.05918, 0.03189, 0.03386, 0.02871, 0.01922, 0.04632, 0.04419, 0.04232, 0.06324, -0.02165, -0.02932, -0.02741, 0.06699, 0.08885, 0.08744, 0.09427, -0.11096, -0.15606, -0.1615, -0.15564, 0.18728, 0.05358, 0.04531, 0.0442, -0.05948, -0.08937, -0.09552, -0.08757, 0.14587, -0.0037, -0.00897, -0.02026, 0.10208, 0.01576, 0.00743, 0.00688, -0.01839, -0.10759, -0.11155, -0.11325, -0.08596, 0.02842, 0.03093, 0.03489, -0.08918, -0.08328, -0.08701, -0.08407, -0.087, -0.2154, -0.21834, -0.20714, 0.03836, 0.0256, 0.01726, 0.02705, -0.02917, 0.10387, 0.09919, 0.10496],
  'image_embeddings.1': [0.06799, -0.01668, -0.16461, -0.26642, -0.02358, -0.06139, -0.14047, -0.17929, -0.13634, 0.00113, 0.13592, 0.15142, 0.68145, 0.40764, 0.10858, 0.16952, -0.10536, -0.20212, -0.15522, -0.01008, -0.4973, -0.34314, 0.52188, 0.12801, -0.29627, -0.42326, -0.061, 0.01698, -0.31561, -0.21154, 0.00043, -0.02918, 0.15744, 0.16909, -0.01588, 0.02912, 0.02391, 0.09847, 0.07693, 0.05456, -0.10136, 0.02387, 0.14167, 0.12516, -0.02556, 0.04675, -0.12853, -0.17476, 0.02441, -0.16866, 0.00223, 0.05511, -0.04319, -0.16984, 0.09739, -0.05266, 0.32318, 0.41428, 0.2308, 0.34254, 0.17271, 0.26495, 0.12074, 0.15903, 0.11078, 0.23043, 0.11703, 0.10982, -0.05887, -0.15798, 0.16868, 0.12967, 0.01417, 0.20177, 0.15637, -0.04421, 0.02302, 0.03299, -0.2785, -0.16123, -0.49104, -0.04405, 0.20463, 0.28056, -0.07119, -0.18662, -0.08736, -0.07175, -0.08576, -0.12556, -0.05655, -0.13647, -0.00658, 0.02355, 0.05262, 0.0487, 0.24549, 0.32308, 0.02018, 0.09235, -0.04492, -0.0401, -0.24153, -0.14029, 0.03327, -0.05556, 0.10476, 0.0267, 0.28102, 0.2309, 0.08689, 0.02263, -0.15401, -0.05424, 0.15611, 0.04385, 0.19431, 0.1046, 0.15106, -0.08028, -0.1172, -0.19001, 0.50704, 0.31775, -0.04231, 0.18061, 0.35349, 0.39941],
  'image_embeddings.2': [-0.21915, -0.07853, -0.25052, 0.14446, 0.42081, 0.27287, -0.50692, 0.12432, -0.02159, 0.09066, -0.37415, 0.14291, -0.43764, 0.67483, 0.39212, -0.04982, 0.15486, -0.55505, 0.33265, -0.21303, 0.06278, 0.04672, 0.07453, 0.30612, 0.20855, -0.14344, 0.32122, 0.60153, 0.11582, 0.58976, 0.02584, 0.24538, 0.47948, 0.27145, 0.39102, 0.28933, 0.31124, 0.19335, -0.09193, 0.44682, -0.11377, 0.63744, 0.08447, -0.07713, -0.00335, 0.38301, 0.24343, 0.04034, -0.3193, -0.2022, -0.23972, 0.10195, -0.49339, -0.4141, 0.08142, -0.05732, 0.41683, 0.56564, 0.10577, 0.31262, -0.81425, -0.04099, 0.0434, -0.24009, -0.0353, -0.7182, -0.02226, -0.05438, -0.29613, 0.39112, -0.24633, -0.31009, -0.02545, -0.13723, -0.18901, -0.35552, 0.14406, -0.07999, -0.37748, -0.11983, 0.19325, 0.47082, -0.01213, -0.39773, -0.31043, -0.1302, -0.09615, -0.45763, -0.22353, -0.02736, 0.27728, 0.4463, -0.34921, -0.09846, 0.23635, 0.32637, -0.06791, 0.20171, 0.25517, -0.32879, -0.04876, 0.11619, -0.02249, 0.2395, -0.2405, -0.52661, 0.58792, 0.20568, 0.17005, -1.0049, -0.50201, 0.03751, -0.44646, 0.03654, 0.06951, 0.03824, 0.8593, 0.20769, -0.30466, 0.37802, 0.08784, -0.69796, 0.51907, 0.4224, 0.51884, -0.31943, -0.11798, -0.76952],
};
