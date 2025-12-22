# FastSAM ONNX Spike Results

**Date:** 2025-12-22
**Status:** ✅ SUCCESS - Feasibility Confirmed

## Objective

Verify FastSAM can be exported to ONNX and run via onnxruntime-node in Node.js for grain detection.

## Results Summary

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| Model load time | ~1.0s | - | ✅ |
| Inference time | ~2.5s | <5s | ✅ |
| Total time | ~4.0s | - | ✅ |
| Detected segments | 70 | - | ✅ |
| Model size | 276 MB | - | ✅ |

## Test Configuration

- **Model:** FastSAM-x exported to ONNX
- **Input size:** 1024x1024 (matching GrainSight)
- **Confidence threshold:** 0.25
- **IOU threshold:** 0.70
- **Test image:** 2252x1239 TIFF thin section
- **Execution provider:** CPU only

## Technical Details

### Model Export

Successfully exported FastSAM-x.pt to ONNX using Ultralytics:

```python
from ultralytics import YOLO
model = YOLO('FastSAM-x.pt')
model.export(format='onnx', imgsz=1024, opset=17, simplify=False)
```

### ONNX Model Specifications

- **Input:** `images` - `[1, 3, 1024, 1024]` (BCHW, float32)
- **Output0:** `[1, 37, 21504]` - Detection outputs (4 bbox + 1 class + 32 mask coefficients)
- **Output1:** `[1, 32, 256, 256]` - 32 prototype masks at 256x256

### Post-Processing Pipeline

1. Extract bounding boxes (cx, cy, w, h → x1, y1, x2, y2)
2. Filter by confidence threshold
3. Apply Non-Maximum Suppression (NMS)
4. For each detection:
   - Multiply mask coefficients with prototype masks
   - Apply sigmoid and threshold at 0.5
   - Clip to bounding box

### Code Example

```javascript
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

const session = await ort.InferenceSession.create('FastSAM-x.onnx', {
  executionProviders: ['cpu']
});

// Preprocess image to [1, 3, 1024, 1024] float32
// Run inference
const results = await session.run({ images: tensor });
// Post-process output0 and output1 to get masks
```

## Key Findings

1. **ONNX Runtime Node.js works well** - onnxruntime-node v1.20+ provides stable CPU inference
2. **FastSAM exports cleanly to ONNX** - No issues with model conversion
3. **Performance meets requirements** - 2.5s inference on CPU is acceptable
4. **Post-processing is straightforward** - Standard YOLO segmentation output format

## Recommendations

### GO Decision: Proceed with Implementation

FastSAM via ONNX is viable for replacing the current OpenCV-based grain detection.

### Next Steps

1. **Integrate into StraboMicro2** - Add FastSAM as alternative grain detection method
2. **Optimize post-processing** - Port GrainSight's morphological operations
3. **Add GPU support** - Test with CoreML/Metal on macOS for faster inference
4. **Bundle model** - Package ONNX model with application

### Potential Optimizations

- **WebGPU/Metal acceleration** - Could reduce inference to <1s
- **FastSAM-s model** - Smaller variant (~60MB) for faster inference
- **Quantization** - INT8 quantization could reduce model size and speed up CPU inference

## Files Created

- `test-inference.js` - Basic inference test
- `visualize-masks.js` - Mask visualization
- `models/FastSAM-x.onnx` - Exported ONNX model (276 MB)
- `output-visualization.png` - Visual verification

## Dependencies

```json
{
  "onnxruntime-node": "^1.20.1",
  "sharp": "^0.33.5"
}
```

## Conclusion

The spike successfully demonstrates that FastSAM can run natively in Node.js via ONNX Runtime, meeting all success criteria:

- ✅ FastSAM ONNX model runs in Node.js
- ✅ Produces mask output similar to Python version
- ✅ Inference time < 5 seconds on CPU

**Recommendation:** Proceed with full implementation to replace OpenCV grain detection.
