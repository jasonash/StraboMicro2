/**
 * Apply a test affine transformation (rotation + skew + scale) to an image
 * for testing the 3-point registration feature.
 *
 * Usage: node scripts/apply-test-skew.js
 */

const sharp = require('sharp');
const path = require('path');

// Configuration - the transformation to apply
const ROTATION_DEGREES = 12;      // Rotation angle
const SHEAR_DEGREES = 8;          // Horizontal shear angle
const SCALE = 0.95;               // Scale factor

// Convert degrees to radians
const rotRad = (ROTATION_DEGREES * Math.PI) / 180;
const shearRad = (SHEAR_DEGREES * Math.PI) / 180;

// Build transformation matrices
// Rotation matrix: [cos, -sin, sin, cos]
const cosR = Math.cos(rotRad);
const sinR = Math.sin(rotRad);

// Shear matrix: [1, tan(shear), 0, 1]
const shearX = Math.tan(shearRad);

// Combined matrix: Rotation * Shear * Scale
// First: Shear * Scale = [scale, shearX*scale, 0, scale]
// Then: Rotation * (Shear * Scale)
const a = SCALE * (cosR + shearX * sinR);
const b = SCALE * (-sinR + shearX * cosR);
const c = SCALE * sinR;
const d = SCALE * cosR;

console.log('=== Affine Transform Test Image Generator ===\n');
console.log('Applied transformation:');
console.log(`  Rotation: ${ROTATION_DEGREES}°`);
console.log(`  Horizontal shear: ${SHEAR_DEGREES}°`);
console.log(`  Scale: ${SCALE}x`);
console.log('\nAffine matrix [a, b, c, d]:');
console.log(`  [${a.toFixed(6)}, ${b.toFixed(6)}]`);
console.log(`  [${c.toFixed(6)}, ${d.toFixed(6)}]`);

const inputPath = path.join(__dirname, '../docs/images/skew_small.jpg');
const outputPath = path.join(__dirname, '../docs/images/skew_small_transformed.jpg');

async function applyTransform() {
  try {
    // Get input image dimensions
    const metadata = await sharp(inputPath).metadata();
    console.log(`\nInput image: ${metadata.width}x${metadata.height}`);

    // Calculate output dimensions to fit transformed image
    // For safety, expand canvas to avoid clipping
    const expand = 1.5;
    const outputWidth = Math.ceil(metadata.width * expand);
    const outputHeight = Math.ceil(metadata.height * expand);

    // Sharp's affine uses the matrix differently - it maps output to input (inverse)
    // So we need to provide the inverse of our forward transform
    // For a 2x2 matrix [a,b,c,d], inverse is [d,-b,-c,a] / determinant
    const det = a * d - b * c;
    const invA = d / det;
    const invB = -b / det;
    const invC = -c / det;
    const invD = a / det;

    console.log('\nInverse matrix for Sharp:');
    console.log(`  [${invA.toFixed(6)}, ${invB.toFixed(6)}]`);
    console.log(`  [${invC.toFixed(6)}, ${invD.toFixed(6)}]`);

    await sharp(inputPath)
      .affine(
        [[invA, invB], [invC, invD]],
        {
          background: { r: 255, g: 255, b: 255, alpha: 1 },
          odx: outputWidth / 2 - metadata.width / 2,  // Center the output
          ody: outputHeight / 2 - metadata.height / 2
        }
      )
      .resize(outputWidth, outputHeight, { fit: 'contain', background: 'white' })
      .jpeg({ quality: 95 })
      .toFile(outputPath);

    console.log(`\nOutput saved to: ${outputPath}`);
    console.log('\n=== Ground Truth for Testing ===');
    console.log('When you register this image back to the original,');
    console.log('the computed inverse transform should approximately match:');
    console.log(`  Rotation: -${ROTATION_DEGREES}° (to undo)`);
    console.log(`  Shear: -${SHEAR_DEGREES}° (to undo)`);
    console.log(`  Scale: ${(1/SCALE).toFixed(4)}x (to undo)`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

applyTransform();
