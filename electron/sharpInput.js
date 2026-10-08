/**
 * sharp input options for image files people bring in (New Micrograph,
 * batch import, images inside an imported .smz).
 *
 * failOn 'error': libvips stops on real decoding errors but not on warnings.
 * sharp's default ('warning') refused readable TIFFs over harmless format
 * warnings, e.g. "Invalid TIFF directory; tags are not sorted in ascending
 * order" from microscope software (Sentry ELECTRON-2P, 2026-10-08). A
 * truncated file is still refused.
 */
const USER_IMAGE_INPUT = Object.freeze({ limitInputPixels: false, failOn: 'error' });

module.exports = { USER_IMAGE_INPUT };
