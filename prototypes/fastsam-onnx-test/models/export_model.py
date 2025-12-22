
import os
os.chdir('/Users/jason/Desktop/Work/StraboMicro2/prototypes/fastsam-onnx-test/models')

from ultralytics import YOLO

# Load the FastSAM model (GrainSight uses YOLO class to load it)
# Model should be in the current directory after download
model_path = '/Users/jason/Desktop/Work/StraboMicro2/prototypes/fastsam-onnx-test/models/FastSAM-x.pt'
if not os.path.exists(model_path):
    print(f'Model not found at {model_path}')
    print('Downloading FastSAM-x.pt...')
    # Let YOLO download it
    model = YOLO('FastSAM-x.pt')
else:
    print(f'Loading model from: {model_path}')
    model = YOLO(model_path)

print(f'Loaded model: {type(model)}')

# Export to ONNX with 1024x1024 input (matching GrainSight)
# Note: simplify=False because onnxsim requires cmake to build
result = model.export(
    format='onnx',
    imgsz=1024,
    opset=17,
    simplify=False,
    dynamic=False
)

print(f'Export complete! Result: {result}')
