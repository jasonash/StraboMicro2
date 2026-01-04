/**
 * Download FastSAM-x ONNX model from Hugging Face
 *
 * Options:
 * 1. Qualcomm FastSam-X (640x640 input) - https://huggingface.co/qualcomm/FastSam-X
 * 2. Export from Ultralytics (1024x1024 input) - requires Python
 *
 * For this spike, we'll try the Ultralytics export approach first since
 * GrainSight uses 1024x1024 input and we want to match their results.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_DIR = path.join(__dirname, 'models');

async function downloadWithPython() {
  console.log('Exporting FastSAM-x to ONNX using Ultralytics...');
  console.log('This requires: pip install ultralytics');

  // Create models directory
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }

  // Python script to export the model
  const pythonScript = `
import os
os.chdir('${MODEL_DIR.replace(/'/g, "\\'")}')

from ultralytics import FastSAM

# Load the model
model = FastSAM('FastSAM-x.pt')

# Export to ONNX with 1024x1024 input (matching GrainSight)
model.export(
    format='onnx',
    imgsz=1024,
    opset=17,
    simplify=True,
    dynamic=False
)

print('Export complete!')
`;

  const scriptPath = path.join(MODEL_DIR, 'export_model.py');
  fs.writeFileSync(scriptPath, pythonScript);

  try {
    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}"`, {
      cwd: MODEL_DIR,
      timeout: 300000 // 5 minute timeout
    });
    console.log(stdout);
    if (stderr) console.error(stderr);
    console.log(`\nModel exported to: ${MODEL_DIR}/FastSAM-x.onnx`);
  } catch (error) {
    console.error('Export failed:', error.message);
    console.log('\nAlternative: Download pre-exported model from Qualcomm (640x640):');
    console.log('https://huggingface.co/qualcomm/FastSam-X/resolve/main/FastSam-X.onnx');
  }
}

async function downloadQualcommModel() {
  console.log('Downloading pre-exported FastSam-X from Qualcomm (640x640)...');

  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }

  const modelPath = path.join(MODEL_DIR, 'FastSam-X-qualcomm.onnx');
  const url = 'https://huggingface.co/qualcomm/FastSam-X/resolve/main/FastSam-X.onnx';

  try {
    const { stdout } = await execAsync(`curl -L "${url}" -o "${modelPath}"`, {
      timeout: 600000 // 10 minute timeout for large file
    });
    console.log(`Model downloaded to: ${modelPath}`);
  } catch (error) {
    console.error('Download failed:', error.message);
  }
}

// Check command line args
const args = process.argv.slice(2);
if (args.includes('--qualcomm')) {
  downloadQualcommModel();
} else {
  downloadWithPython();
}
