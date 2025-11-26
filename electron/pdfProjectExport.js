/**
 * PDF Project Export Module
 *
 * Generates a professional PDF report of the entire project including:
 * - Cover page with project summary
 * - Table of contents with clickable links
 * - Project details
 * - Dataset summaries
 * - Sample details with all metadata
 * - Micrograph pages with composite images and full metadata
 * - Spot details with all feature info
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const log = require('electron-log');

// Page dimensions (US Letter)
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

// Colors (neutral professional palette)
const COLORS = {
  primary: '#2C3E50',      // Dark blue-gray for headings
  secondary: '#7F8C8D',    // Medium gray for subheadings
  accent: '#3498DB',       // Blue for links and accents
  text: '#333333',         // Dark gray for body text
  lightText: '#666666',    // Light gray for secondary text
  border: '#BDC3C7',       // Light gray for borders
  background: '#F8F9FA',   // Very light gray for card backgrounds
  white: '#FFFFFF'
};

// Font sizes
const FONT_SIZES = {
  title: 24,
  heading1: 18,
  heading2: 14,
  heading3: 12,
  body: 10,
  small: 9,
  caption: 8
};

/**
 * Format a date string or timestamp to human-readable format
 */
function formatDate(dateValue) {
  if (!dateValue) return null;

  try {
    let date;
    if (typeof dateValue === 'number') {
      date = new Date(dateValue);
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      return null;
    }

    if (isNaN(date.getTime())) return null;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return null;
  }
}

/**
 * Format a field label from camelCase to Title Case with spaces
 */
function formatLabel(key) {
  // Handle special cases
  const specialCases = {
    'id': 'ID',
    'sampleID': 'Sample ID',
    'parentID': 'Parent ID',
    'gpsDatum': 'GPS Datum',
    'ebsd': 'EBSD',
    'eds': 'EDS',
    'bse': 'BSE',
    'sem': 'SEM',
    'tem': 'TEM',
    'wds': 'WDS',
    'rgb': 'RGB',
    'url': 'URL'
  };

  if (specialCases[key]) return specialCases[key];

  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Check if a value should be displayed (not null, undefined, empty string, or empty array)
 */
function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * PDFProjectExporter class
 * Handles generation of the full project PDF report
 */
class PDFProjectExporter {
  constructor(projectData, projectId, folderPaths, options = {}) {
    this.projectData = projectData;
    this.projectId = projectId;
    this.folderPaths = folderPaths;
    this.options = {
      imageQuality: 80,
      imageDPI: 150,
      ...options
    };

    this.doc = null;
    this.tocEntries = [];
    this.currentPage = 1;
    this.progressCallback = null;

    // Collect all entities for counting and TOC
    this.allDatasets = [];
    this.allSamples = [];
    this.allMicrographs = [];
    this.allSpots = [];
    this.collectEntities();
  }

  /**
   * Collect all entities from project for counting and iteration
   */
  collectEntities() {
    for (const dataset of this.projectData.datasets || []) {
      this.allDatasets.push(dataset);
      for (const sample of dataset.samples || []) {
        this.allSamples.push({ sample, dataset });
        for (const micrograph of sample.micrographs || []) {
          this.allMicrographs.push({ micrograph, sample, dataset });
          for (const spot of micrograph.spots || []) {
            this.allSpots.push({ spot, micrograph, sample, dataset });
          }
        }
      }
    }
  }

  /**
   * Set progress callback for UI updates
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * Report progress to callback
   */
  reportProgress(phase, current, total, itemName) {
    if (this.progressCallback) {
      this.progressCallback({
        phase,
        current,
        total,
        itemName,
        percentage: Math.round((current / total) * 100)
      });
    }
  }

  /**
   * Generate the complete PDF
   */
  async generate(outputPath, compositeGenerator) {
    return new Promise(async (resolve, reject) => {
      try {
        log.info('[PDFExport] Starting PDF generation');

        // Create PDF document
        this.doc = new PDFDocument({
          size: 'LETTER',
          margins: {
            top: MARGIN,
            bottom: MARGIN,
            left: MARGIN,
            right: MARGIN
          },
          bufferPages: true,
          info: {
            Title: `${this.projectData.name || 'Project'} - StraboMicro Report`,
            Author: 'StraboMicro',
            Subject: 'Geological Microanalysis Report',
            Creator: 'StraboMicro2'
          }
        });

        // Pipe to file
        const stream = fs.createWriteStream(outputPath);
        this.doc.pipe(stream);

        // Track page numbers
        this.doc.on('pageAdded', () => {
          this.currentPage++;
        });

        // Calculate total steps for progress
        const totalSteps = 3 + this.allDatasets.length + this.allSamples.length +
                          this.allMicrographs.length + this.allSpots.length;
        let currentStep = 0;

        // Generate cover page
        this.reportProgress('Generating cover page', ++currentStep, totalSteps, 'Cover');
        this.generateCoverPage();

        // Calculate how many pages we need for TOC
        const totalTocEntries = 1 + this.allDatasets.length + this.allSamples.length +
                               this.allMicrographs.length + this.allSpots.length;
        const entriesPerPage = Math.floor((PAGE_HEIGHT - MARGIN * 2 - 60) / 18);
        const tocPagesNeeded = Math.max(1, Math.ceil(totalTocEntries / entriesPerPage));

        // Reserve pages for TOC
        this.doc.addPage();
        const tocPageStart = this.currentPage;
        for (let i = 1; i < tocPagesNeeded; i++) {
          this.doc.addPage();
        }
        this.reportProgress('Preparing table of contents', ++currentStep, totalSteps, 'TOC');

        // Generate project details (new page)
        this.doc.addPage();
        this.reportProgress('Generating project details', ++currentStep, totalSteps, 'Project Details');
        this.generateProjectDetails();

        // Generate dataset sections (each on new page)
        for (const dataset of this.allDatasets) {
          this.doc.addPage();
          this.reportProgress('Generating dataset', ++currentStep, totalSteps, dataset.name || 'Dataset');
          this.generateDatasetSection(dataset);
        }

        // Generate sample sections (each on new page)
        for (const { sample, dataset } of this.allSamples) {
          this.doc.addPage();
          this.reportProgress('Generating sample', ++currentStep, totalSteps, sample.name || sample.label || 'Sample');
          this.generateSampleSection(sample, dataset);
        }

        // Generate micrograph sections (each on new page - these have images)
        for (const { micrograph, sample, dataset } of this.allMicrographs) {
          this.doc.addPage();
          this.reportProgress('Generating micrograph', ++currentStep, totalSteps, micrograph.name || 'Micrograph');
          await this.generateMicrographSection(micrograph, sample, dataset, compositeGenerator);
        }

        // Generate spot sections (each on new page)
        for (const { spot, micrograph, sample, dataset } of this.allSpots) {
          this.doc.addPage();
          this.reportProgress('Generating spot', ++currentStep, totalSteps, spot.name || 'Spot');
          this.generateSpotSection(spot, micrograph, sample, dataset);
        }

        // Now go back and fill in the TOC
        this.reportProgress('Finalizing PDF', totalSteps, totalSteps, 'TOC');
        this.fillTableOfContents(tocPageStart, tocPagesNeeded);

        // Add page numbers to all pages
        this.addPageNumbers();

        // Finalize PDF
        this.doc.end();

        stream.on('finish', () => {
          log.info(`[PDFExport] PDF generated successfully: ${outputPath}`);
          resolve(outputPath);
        });

        stream.on('error', (err) => {
          log.error('[PDFExport] Stream error:', err);
          reject(err);
        });

      } catch (error) {
        log.error('[PDFExport] Generation error:', error);
        reject(error);
      }
    });
  }

  /**
   * Generate the cover page
   */
  generateCoverPage() {
    const doc = this.doc;
    const centerX = PAGE_WIDTH / 2;

    // Title - project name
    doc.fontSize(FONT_SIZES.title + 8)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text(this.projectData.name || 'Untitled Project', MARGIN, 200, {
         width: CONTENT_WIDTH,
         align: 'center'
       });

    // Subtitle
    doc.moveDown(1)
       .fontSize(FONT_SIZES.heading1)
       .fillColor(COLORS.secondary)
       .font('Helvetica')
       .text('StraboMicro Project Report', {
         width: CONTENT_WIDTH,
         align: 'center'
       });

    // Horizontal rule
    doc.moveDown(2);
    const lineY = doc.y;
    doc.strokeColor(COLORS.border)
       .lineWidth(1)
       .moveTo(MARGIN + 100, lineY)
       .lineTo(PAGE_WIDTH - MARGIN - 100, lineY)
       .stroke();

    // Summary statistics
    doc.moveDown(3)
       .fontSize(FONT_SIZES.body)
       .fillColor(COLORS.text)
       .font('Helvetica');

    const stats = [
      `${this.allDatasets.length} Dataset${this.allDatasets.length !== 1 ? 's' : ''}`,
      `${this.allSamples.length} Sample${this.allSamples.length !== 1 ? 's' : ''}`,
      `${this.allMicrographs.length} Micrograph${this.allMicrographs.length !== 1 ? 's' : ''}`,
      `${this.allSpots.length} Spot${this.allSpots.length !== 1 ? 's' : ''}`
    ];

    doc.text(stats.join('  |  '), {
      width: CONTENT_WIDTH,
      align: 'center'
    });

    // Export date at bottom
    doc.fontSize(FONT_SIZES.small)
       .fillColor(COLORS.lightText)
       .text(`Generated on ${new Date().toLocaleDateString('en-US', {
         year: 'numeric',
         month: 'long',
         day: 'numeric'
       })}`, MARGIN, PAGE_HEIGHT - 100, {
         width: CONTENT_WIDTH,
         align: 'center'
       });

    // Add TOC entry
    this.tocEntries.push({
      title: 'Project Details',
      page: 3,
      level: 0
    });
  }

  /**
   * Fill in the table of contents (called after all content is generated)
   */
  fillTableOfContents(tocPageStart, tocPagesNeeded) {
    const doc = this.doc;
    const lineHeight = 18;
    let currentTocPage = 0;
    let y = MARGIN;

    // Switch to first TOC page
    doc.switchToPage(tocPageStart - 1);

    // Title on first page
    doc.fontSize(FONT_SIZES.heading1)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text('Table of Contents', MARGIN, MARGIN);

    y = doc.y + 20;

    // TOC entries
    for (const entry of this.tocEntries) {
      // Check if we need to move to next TOC page
      if (y > PAGE_HEIGHT - MARGIN - 30) {
        currentTocPage++;
        if (currentTocPage < tocPagesNeeded) {
          doc.switchToPage(tocPageStart - 1 + currentTocPage);
          y = MARGIN;
        } else {
          // No more TOC pages available, stop
          break;
        }
      }

      const indent = entry.level * 15;
      const fontSize = entry.level === 0 ? FONT_SIZES.body : FONT_SIZES.small;
      const fontWeight = entry.level === 0 ? 'Helvetica-Bold' : 'Helvetica';

      doc.fontSize(fontSize)
         .font(fontWeight)
         .fillColor(entry.level === 0 ? COLORS.primary : COLORS.text);

      // Entry title
      doc.text(entry.title, MARGIN + indent, y, {
        width: CONTENT_WIDTH - indent - 40,
        lineBreak: false
      });

      // Page number (right-aligned)
      doc.text(entry.page.toString(), PAGE_WIDTH - MARGIN - 30, y, {
        width: 30,
        align: 'right'
      });

      y += lineHeight;
    }
  }

  /**
   * Add page numbers to all pages
   */
  addPageNumbers() {
    const doc = this.doc;
    const range = doc.bufferedPageRange();
    const totalPages = range.start + range.count;

    for (let i = range.start; i < totalPages; i++) {
      doc.switchToPage(i);

      // Skip cover page (page index 0)
      if (i === 0) continue;

      // Add page number at bottom center
      doc.fontSize(FONT_SIZES.small)
         .fillColor(COLORS.lightText)
         .font('Helvetica')
         .text(`Page ${i + 1} of ${totalPages}`, MARGIN, PAGE_HEIGHT - 30, {
           width: CONTENT_WIDTH,
           align: 'center'
         });
    }
  }

  /**
   * Generate project details section
   */
  generateProjectDetails() {
    const doc = this.doc;
    const project = this.projectData;

    // Section header
    this.addSectionHeader('Project Details');

    // Project info card
    this.startCard();

    const fields = [
      { key: 'name', label: 'Project Name' },
      { key: 'startDate', label: 'Start Date', format: formatDate },
      { key: 'endDate', label: 'End Date', format: formatDate },
      { key: 'purposeOfStudy', label: 'Purpose of Study' },
      { key: 'areaOfInterest', label: 'Area of Interest' },
      { key: 'projectLocation', label: 'Project Location' },
      { key: 'instrumentsUsed', label: 'Instruments Used' },
      { key: 'otherTeamMembers', label: 'Team Members' },
      { key: 'gpsDatum', label: 'GPS Datum' },
      { key: 'magneticDeclination', label: 'Magnetic Declination' },
      { key: 'date', label: 'Date Created', format: formatDate },
      { key: 'modifiedTimestamp', label: 'Last Modified', format: formatDate },
      { key: 'notes', label: 'Notes' }
    ];

    this.addFieldList(project, fields);
    this.endCard();
  }

  /**
   * Generate dataset section
   */
  generateDatasetSection(dataset) {
    const doc = this.doc;

    // Add to TOC
    this.tocEntries.push({
      title: `Dataset: ${dataset.name || 'Unnamed'}`,
      page: this.currentPage,
      level: 0
    });

    // Section header
    this.addSectionHeader(`Dataset: ${dataset.name || 'Unnamed'}`);

    // Dataset info card
    this.startCard();

    const fields = [
      { key: 'name', label: 'Name' },
      { key: 'date', label: 'Date Created', format: formatDate },
      { key: 'modifiedTimestamp', label: 'Last Modified', format: formatDate }
    ];

    this.addFieldList(dataset, fields);

    // Sample count
    const sampleCount = (dataset.samples || []).length;
    doc.fontSize(FONT_SIZES.body)
       .fillColor(COLORS.text)
       .font('Helvetica')
       .text(`Contains ${sampleCount} sample${sampleCount !== 1 ? 's' : ''}`);

    this.endCard();
  }

  /**
   * Generate sample section
   */
  generateSampleSection(sample, dataset) {
    const doc = this.doc;
    const sampleName = sample.name || sample.label || 'Unnamed';

    // Add to TOC
    this.tocEntries.push({
      title: `Sample: ${sampleName}`,
      page: this.currentPage,
      level: 1
    });

    // Section header with breadcrumb
    this.addBreadcrumb([dataset.name || 'Dataset']);
    this.addSectionHeader(`Sample: ${sampleName}`);

    // Sample info card
    this.startCard();

    const fields = [
      { key: 'label', label: 'Label' },
      { key: 'sampleID', label: 'Sample ID' },
      { key: 'latitude', label: 'Latitude' },
      { key: 'longitude', label: 'Longitude' },
      { key: 'mainSamplingPurpose', label: 'Sampling Purpose' },
      { key: 'sampleDescription', label: 'Description' },
      { key: 'materialType', label: 'Material Type' },
      { key: 'sampleType', label: 'Sample Type' },
      { key: 'lithology', label: 'Lithology' },
      { key: 'color', label: 'Color' },
      { key: 'sampleSize', label: 'Sample Size' },
      { key: 'degreeOfWeathering', label: 'Degree of Weathering' },
      { key: 'inplacenessOfSample', label: 'Inplaceness' },
      { key: 'orientedSample', label: 'Oriented Sample' },
      { key: 'sampleOrientationNotes', label: 'Orientation Notes' },
      { key: 'sampleUnit', label: 'Sample Unit' },
      { key: 'sampleNotes', label: 'Notes' }
    ];

    this.addFieldList(sample, fields);

    // Micrograph count
    const microCount = (sample.micrographs || []).length;
    doc.fontSize(FONT_SIZES.body)
       .fillColor(COLORS.text)
       .font('Helvetica')
       .text(`Contains ${microCount} micrograph${microCount !== 1 ? 's' : ''}`);

    this.endCard();
  }

  /**
   * Generate micrograph section with composite image
   */
  async generateMicrographSection(micrograph, sample, dataset, compositeGenerator) {
    const doc = this.doc;
    const micrographName = micrograph.name || 'Unnamed';

    // Add to TOC
    this.tocEntries.push({
      title: `Micrograph: ${micrographName}`,
      page: this.currentPage,
      level: 1
    });

    // Build breadcrumb path
    const breadcrumbPath = [dataset.name || 'Dataset', sample.name || sample.label || 'Sample'];
    if (micrograph.parentID) {
      // Find parent chain
      const parentChain = this.getMicrographParentChain(micrograph.parentID, sample);
      breadcrumbPath.push(...parentChain);
    }

    this.addBreadcrumb(breadcrumbPath);
    this.addSectionHeader(`Micrograph: ${micrographName}`);

    // Micrograph type indicator
    const isReference = !micrograph.parentID;
    doc.fontSize(FONT_SIZES.small)
       .fillColor(COLORS.secondary)
       .font('Helvetica-Oblique')
       .text(isReference ? 'Reference Micrograph' : 'Associated Micrograph');
    doc.moveDown(0.5);

    // Try to add composite image
    if (compositeGenerator) {
      try {
        const imageBuffer = await compositeGenerator(this.projectId, micrograph, this.projectData, this.folderPaths);
        if (imageBuffer) {
          // Calculate image dimensions to fit page width while maintaining aspect ratio
          const maxWidth = CONTENT_WIDTH;
          const maxHeight = 350; // Max height for image on page

          // Get image dimensions from sharp metadata
          const sharp = require('sharp');
          const metadata = await sharp(imageBuffer).metadata();
          const imgWidth = metadata.width || 800;
          const imgHeight = metadata.height || 600;

          // Calculate scaled dimensions
          let displayWidth = imgWidth;
          let displayHeight = imgHeight;

          // Scale to fit maxWidth
          if (displayWidth > maxWidth) {
            const scale = maxWidth / displayWidth;
            displayWidth = maxWidth;
            displayHeight = imgHeight * scale;
          }

          // Scale to fit maxHeight
          if (displayHeight > maxHeight) {
            const scale = maxHeight / displayHeight;
            displayHeight = maxHeight;
            displayWidth = displayWidth * scale;
          }

          // Check if we need a page break for the image
          if (doc.y + displayHeight > PAGE_HEIGHT - MARGIN - 50) {
            doc.addPage();
          }

          const startY = doc.y;

          // Add image with calculated dimensions
          doc.image(imageBuffer, MARGIN, startY, {
            width: displayWidth,
            height: displayHeight
          });

          // Manually move cursor below the image
          doc.y = startY + displayHeight + 15;
        }
      } catch (err) {
        log.warn(`[PDFExport] Could not generate composite for ${micrographName}:`, err.message);
        doc.fontSize(FONT_SIZES.small)
           .fillColor(COLORS.lightText)
           .font('Helvetica-Oblique')
           .text('[Image could not be generated]');
        doc.moveDown(1);
      }
    }

    // Micrograph metadata
    this.startCard();

    const basicFields = [
      { key: 'name', label: 'Name' },
      { key: 'imageType', label: 'Image Type' },
      { key: 'width', label: 'Width (px)' },
      { key: 'height', label: 'Height (px)' },
      { key: 'scalePixelsPerCentimeter', label: 'Scale (px/cm)' },
      { key: 'scale', label: 'Scale Description' },
      { key: 'description', label: 'Description' },
      { key: 'notes', label: 'Notes' },
      { key: 'polish', label: 'Polish', format: v => v ? 'Yes' : 'No' },
      { key: 'polishDescription', label: 'Polish Description' }
    ];

    this.addFieldList(micrograph, basicFields);
    this.endCard();

    // Instrument information
    if (micrograph.instrument && Object.keys(micrograph.instrument).some(k => hasValue(micrograph.instrument[k]))) {
      this.checkPageBreak(150);
      this.addSubsectionHeader('Instrument Information');
      this.startCard();

      const instrumentFields = [
        { key: 'instrumentType', label: 'Instrument Type' },
        { key: 'dataType', label: 'Data Type' },
        { key: 'instrumentBrand', label: 'Brand' },
        { key: 'instrumentModel', label: 'Model' },
        { key: 'university', label: 'University' },
        { key: 'laboratory', label: 'Laboratory' },
        { key: 'dataCollectionSoftware', label: 'Collection Software' },
        { key: 'dataCollectionSoftwareVersion', label: 'Software Version' },
        { key: 'postProcessingSoftware', label: 'Post Processing Software' },
        { key: 'postProcessingSoftwareVersion', label: 'Post Processing Version' },
        { key: 'filamentType', label: 'Filament Type' },
        { key: 'accelerationVoltage', label: 'Acceleration Voltage' },
        { key: 'beamCurrent', label: 'Beam Current' },
        { key: 'spotSize', label: 'Spot Size' },
        { key: 'workingDistance', label: 'Working Distance' },
        { key: 'instrumentNotes', label: 'Notes' }
      ];

      this.addFieldList(micrograph.instrument, instrumentFields);

      // Detectors
      if (micrograph.instrument.instrumentDetectors?.length > 0) {
        doc.fontSize(FONT_SIZES.body)
           .fillColor(COLORS.primary)
           .font('Helvetica-Bold')
           .text('Detectors:');
        for (const detector of micrograph.instrument.instrumentDetectors) {
          doc.fontSize(FONT_SIZES.small)
             .fillColor(COLORS.text)
             .font('Helvetica')
             .text(`  - ${detector.detectorType || 'Unknown'}${detector.detectorMake ? ` (${detector.detectorMake})` : ''}`);
        }
      }

      this.endCard();
    }

    // Orientation information
    if (micrograph.orientationInfo && Object.keys(micrograph.orientationInfo).some(k => hasValue(micrograph.orientationInfo[k]))) {
      this.checkPageBreak(100);
      this.addSubsectionHeader('Orientation Information');
      this.startCard();
      this.addFieldList(micrograph.orientationInfo, [
        { key: 'orientationMethod', label: 'Method' },
        { key: 'topTrend', label: 'Top Trend' },
        { key: 'topPlunge', label: 'Top Plunge' },
        { key: 'topReferenceCorner', label: 'Top Reference Corner' },
        { key: 'sideTrend', label: 'Side Trend' },
        { key: 'sidePlunge', label: 'Side Plunge' },
        { key: 'sideReferenceCorner', label: 'Side Reference Corner' },
        { key: 'fabricReference', label: 'Fabric Reference' },
        { key: 'fabricStrike', label: 'Fabric Strike' },
        { key: 'fabricDip', label: 'Fabric Dip' },
        { key: 'lookDirection', label: 'Look Direction' },
        { key: 'topCorner', label: 'Top Corner' }
      ]);
      this.endCard();
    }

    // Feature info sections
    this.addFeatureInfoSections(micrograph);

    // Spots summary
    if (micrograph.spots?.length > 0) {
      this.checkPageBreak(80);
      this.addSubsectionHeader('Spots');
      doc.fontSize(FONT_SIZES.body)
         .fillColor(COLORS.text)
         .font('Helvetica')
         .text(`This micrograph contains ${micrograph.spots.length} spot${micrograph.spots.length !== 1 ? 's' : ''}:`);

      for (const spot of micrograph.spots) {
        doc.fontSize(FONT_SIZES.small)
           .fillColor(COLORS.accent)
           .text(`  - ${spot.name || 'Unnamed Spot'}`);
      }
    }
  }

  /**
   * Generate spot section
   */
  generateSpotSection(spot, micrograph, sample, dataset) {
    const doc = this.doc;
    const spotName = spot.name || 'Unnamed';

    // Add to TOC
    this.tocEntries.push({
      title: `Spot: ${spotName}`,
      page: this.currentPage,
      level: 2
    });

    // Breadcrumb
    const breadcrumbPath = [
      dataset.name || 'Dataset',
      sample.name || sample.label || 'Sample',
      micrograph.name || 'Micrograph'
    ];
    this.addBreadcrumb(breadcrumbPath);
    this.addSectionHeader(`Spot: ${spotName}`);

    // Spot info card
    this.startCard();

    const fields = [
      { key: 'name', label: 'Name' },
      { key: 'geometryType', label: 'Geometry Type' },
      { key: 'color', label: 'Color' },
      { key: 'labelColor', label: 'Label Color' },
      { key: 'date', label: 'Date', format: formatDate },
      { key: 'time', label: 'Time' },
      { key: 'modifiedTimestamp', label: 'Last Modified', format: formatDate },
      { key: 'notes', label: 'Notes' }
    ];

    this.addFieldList(spot, fields);

    // Tags
    if (spot.tags?.length > 0) {
      doc.fontSize(FONT_SIZES.body)
         .fillColor(COLORS.primary)
         .font('Helvetica-Bold')
         .text('Tags: ', { continued: true })
         .font('Helvetica')
         .fillColor(COLORS.text)
         .text(spot.tags.join(', '));
    }

    this.endCard();

    // Feature info sections
    this.addFeatureInfoSections(spot);
  }

  /**
   * Add feature info sections (mineralogy, grain info, fabric, etc.)
   */
  addFeatureInfoSections(entity) {
    const doc = this.doc;

    // Mineralogy
    if (entity.mineralogy && (entity.mineralogy.minerals?.length > 0 || hasValue(entity.mineralogy.notes))) {
      this.checkPageBreak(100);
      this.addSubsectionHeader('Mineralogy');
      this.startCard();

      if (hasValue(entity.mineralogy.mineralogyMethod)) {
        doc.fontSize(FONT_SIZES.body)
           .fillColor(COLORS.text)
           .font('Helvetica')
           .text(`Method: ${entity.mineralogy.mineralogyMethod}`);
      }

      if (entity.mineralogy.minerals?.length > 0) {
        doc.fontSize(FONT_SIZES.body)
           .fillColor(COLORS.primary)
           .font('Helvetica-Bold')
           .text('Minerals:');

        for (const mineral of entity.mineralogy.minerals) {
          const percentage = hasValue(mineral.percentage) ? ` (${mineral.operator || ''}${mineral.percentage}%)` : '';
          doc.fontSize(FONT_SIZES.small)
             .fillColor(COLORS.text)
             .font('Helvetica')
             .text(`  - ${mineral.name || 'Unknown'}${percentage}`);
        }
      }

      if (hasValue(entity.mineralogy.notes)) {
        doc.moveDown(0.3)
           .fontSize(FONT_SIZES.small)
           .fillColor(COLORS.lightText)
           .font('Helvetica-Oblique')
           .text(`Notes: ${entity.mineralogy.notes}`);
      }

      this.endCard();
    }

    // Grain Info
    if (entity.grainInfo) {
      const hasGrainData = entity.grainInfo.grainSizeInfo?.length > 0 ||
                          entity.grainInfo.grainShapeInfo?.length > 0 ||
                          entity.grainInfo.grainOrientationInfo?.length > 0 ||
                          hasValue(entity.grainInfo.grainSizeNotes) ||
                          hasValue(entity.grainInfo.grainShapeNotes) ||
                          hasValue(entity.grainInfo.grainOrientationNotes);

      if (hasGrainData) {
        this.checkPageBreak(100);
        this.addSubsectionHeader('Grain Information');
        this.startCard();

        // Grain size
        if (entity.grainInfo.grainSizeInfo?.length > 0) {
          doc.fontSize(FONT_SIZES.body)
             .fillColor(COLORS.primary)
             .font('Helvetica-Bold')
             .text('Grain Size:');

          for (const size of entity.grainInfo.grainSizeInfo) {
            const phases = size.phases?.join(', ') || 'All phases';
            const stats = [];
            if (hasValue(size.mean)) stats.push(`Mean: ${size.mean}`);
            if (hasValue(size.median)) stats.push(`Median: ${size.median}`);
            if (hasValue(size.mode)) stats.push(`Mode: ${size.mode}`);
            if (hasValue(size.standardDeviation)) stats.push(`StdDev: ${size.standardDeviation}`);
            const unit = size.sizeUnit ? ` ${size.sizeUnit}` : '';

            doc.fontSize(FONT_SIZES.small)
               .fillColor(COLORS.text)
               .font('Helvetica')
               .text(`  ${phases}: ${stats.join(', ')}${unit}`);
          }
        }

        // Grain shape
        if (entity.grainInfo.grainShapeInfo?.length > 0) {
          doc.moveDown(0.3)
             .fontSize(FONT_SIZES.body)
             .fillColor(COLORS.primary)
             .font('Helvetica-Bold')
             .text('Grain Shape:');

          for (const shape of entity.grainInfo.grainShapeInfo) {
            const phases = shape.phases?.join(', ') || 'All phases';
            doc.fontSize(FONT_SIZES.small)
               .fillColor(COLORS.text)
               .font('Helvetica')
               .text(`  ${phases}: ${shape.shape || 'Not specified'}`);
          }
        }

        // Notes
        if (hasValue(entity.grainInfo.grainSizeNotes)) {
          doc.moveDown(0.3)
             .fontSize(FONT_SIZES.small)
             .fillColor(COLORS.lightText)
             .font('Helvetica-Oblique')
             .text(`Size Notes: ${entity.grainInfo.grainSizeNotes}`);
        }
        if (hasValue(entity.grainInfo.grainShapeNotes)) {
          doc.fontSize(FONT_SIZES.small)
             .fillColor(COLORS.lightText)
             .font('Helvetica-Oblique')
             .text(`Shape Notes: ${entity.grainInfo.grainShapeNotes}`);
        }

        this.endCard();
      }
    }

    // Fabric Info
    if (entity.fabricInfo?.fabrics?.length > 0 || hasValue(entity.fabricInfo?.notes)) {
      this.checkPageBreak(100);
      this.addSubsectionHeader('Fabric Information');
      this.startCard();

      if (entity.fabricInfo.fabrics?.length > 0) {
        for (const fabric of entity.fabricInfo.fabrics) {
          doc.fontSize(FONT_SIZES.body)
             .fillColor(COLORS.primary)
             .font('Helvetica-Bold')
             .text(fabric.fabricLabel || 'Fabric');

          const fabricFields = [
            { key: 'fabricElement', label: 'Element' },
            { key: 'fabricCategory', label: 'Category' },
            { key: 'fabricSpacing', label: 'Spacing' }
          ];

          for (const field of fabricFields) {
            if (hasValue(fabric[field.key])) {
              doc.fontSize(FONT_SIZES.small)
                 .fillColor(COLORS.text)
                 .font('Helvetica')
                 .text(`  ${field.label}: ${fabric[field.key]}`);
            }
          }

          if (fabric.fabricDefinedBy?.length > 0) {
            doc.fontSize(FONT_SIZES.small)
               .fillColor(COLORS.text)
               .font('Helvetica')
               .text(`  Defined By: ${fabric.fabricDefinedBy.join(', ')}`);
          }
        }
      }

      if (hasValue(entity.fabricInfo.notes)) {
        doc.moveDown(0.3)
           .fontSize(FONT_SIZES.small)
           .fillColor(COLORS.lightText)
           .font('Helvetica-Oblique')
           .text(`Notes: ${entity.fabricInfo.notes}`);
      }

      this.endCard();
    }

    // Other feature info types (simplified output for brevity)
    const otherFeatureTypes = [
      { key: 'fractureInfo', label: 'Fracture Information', arrayKey: 'fractures' },
      { key: 'foldInfo', label: 'Fold Information', arrayKey: 'folds' },
      { key: 'veinInfo', label: 'Vein Information', arrayKey: 'veins' },
      { key: 'pseudotachylyteInfo', label: 'Pseudotachylyte Information', arrayKey: 'pseudotachylytes' },
      { key: 'faultsShearZonesInfo', label: 'Faults/Shear Zones', arrayKey: 'faultsShearZones' },
      { key: 'clasticDeformationBandInfo', label: 'Clastic Deformation Bands', arrayKey: 'bands' },
      { key: 'grainBoundaryInfo', label: 'Grain Boundary Information', arrayKey: 'boundaries' },
      { key: 'intraGrainInfo', label: 'Intragrain Information', arrayKey: 'grains' },
      { key: 'extinctionMicrostructureInfo', label: 'Extinction Microstructures', arrayKey: 'extinctionMicrostructures' },
      { key: 'lithologyInfo', label: 'Lithology Information', arrayKey: 'lithologies' }
    ];

    for (const featureType of otherFeatureTypes) {
      const featureData = entity[featureType.key];
      if (featureData && (featureData[featureType.arrayKey]?.length > 0 || hasValue(featureData.notes))) {
        this.checkPageBreak(80);
        this.addSubsectionHeader(featureType.label);
        this.startCard();

        // Output the array data as JSON-like summary for complex nested structures
        if (featureData[featureType.arrayKey]?.length > 0) {
          doc.fontSize(FONT_SIZES.small)
             .fillColor(COLORS.text)
             .font('Helvetica')
             .text(`${featureData[featureType.arrayKey].length} ${featureType.arrayKey} recorded`);

          // For each item, output key properties
          for (const item of featureData[featureType.arrayKey]) {
            const summary = this.summarizeFeatureItem(item);
            if (summary) {
              doc.fontSize(FONT_SIZES.small)
                 .fillColor(COLORS.text)
                 .font('Helvetica')
                 .text(`  - ${summary}`);
            }
          }
        }

        if (hasValue(featureData.notes)) {
          doc.moveDown(0.3)
             .fontSize(FONT_SIZES.small)
             .fillColor(COLORS.lightText)
             .font('Helvetica-Oblique')
             .text(`Notes: ${featureData.notes}`);
        }

        this.endCard();
      }
    }
  }

  /**
   * Summarize a feature item for display
   */
  summarizeFeatureItem(item) {
    if (!item) return null;

    // Try common label/name fields first
    if (item.label) return item.label;
    if (item.name) return item.name;
    if (item.type) return item.type;
    if (item.mineral) return item.mineral;
    if (item.mineralogy) return item.mineralogy;
    if (item.typeOfBoundary) return item.typeOfBoundary;
    if (item.phase) return item.phase;

    // For lithology
    if (item.level1) {
      const parts = [item.level1];
      if (item.level2) parts.push(item.level2);
      if (item.level3) parts.push(item.level3);
      return parts.join(' > ');
    }

    // Fallback: first non-null string property
    for (const value of Object.values(item)) {
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    return 'Entry';
  }

  /**
   * Get parent chain for a micrograph
   */
  getMicrographParentChain(parentId, sample) {
    const chain = [];
    let currentId = parentId;

    while (currentId) {
      const parent = (sample.micrographs || []).find(m => m.id === currentId);
      if (parent) {
        chain.unshift(parent.name || 'Micrograph');
        currentId = parent.parentID;
      } else {
        break;
      }
    }

    return chain;
  }

  // ========== Helper Methods ==========

  /**
   * Add a section header
   */
  addSectionHeader(text) {
    this.doc.fontSize(FONT_SIZES.heading1)
            .fillColor(COLORS.primary)
            .font('Helvetica-Bold')
            .text(text);

    // Underline
    const lineY = this.doc.y + 2;
    this.doc.strokeColor(COLORS.accent)
            .lineWidth(2)
            .moveTo(MARGIN, lineY)
            .lineTo(MARGIN + 150, lineY)
            .stroke();

    this.doc.moveDown(1);
  }

  /**
   * Add a subsection header
   */
  addSubsectionHeader(text) {
    this.doc.fontSize(FONT_SIZES.heading2)
            .fillColor(COLORS.primary)
            .font('Helvetica-Bold')
            .text(text);
    this.doc.moveDown(0.5);
  }

  /**
   * Add breadcrumb navigation
   */
  addBreadcrumb(path) {
    this.doc.fontSize(FONT_SIZES.small)
            .fillColor(COLORS.secondary)
            .font('Helvetica')
            .text(path.join(' > '));
    this.doc.moveDown(0.3);
  }

  /**
   * Start a card (visual grouping box)
   */
  startCard() {
    this.cardStartY = this.doc.y;
    this.doc.x = MARGIN + 10;
  }

  /**
   * End a card
   */
  endCard() {
    this.doc.moveDown(0.5);
    this.doc.x = MARGIN;
  }

  /**
   * Add a list of fields with labels and values
   */
  addFieldList(obj, fields) {
    const doc = this.doc;

    for (const field of fields) {
      let value = obj[field.key];

      if (!hasValue(value)) continue;

      // Apply formatter if provided
      if (field.format && value !== null && value !== undefined) {
        value = field.format(value);
        if (!hasValue(value)) continue;
      }

      doc.fontSize(FONT_SIZES.body)
         .fillColor(COLORS.primary)
         .font('Helvetica-Bold')
         .text(`${field.label}: `, { continued: true })
         .font('Helvetica')
         .fillColor(COLORS.text)
         .text(String(value));
    }
  }

  /**
   * Check if we need a page break
   */
  checkPageBreak(neededHeight) {
    if (this.doc.y + neededHeight > PAGE_HEIGHT - MARGIN) {
      this.doc.addPage();
    }
  }
}

/**
 * Export function for generating project PDF
 */
async function generateProjectPDF(outputPath, projectData, projectId, folderPaths, compositeGenerator, progressCallback) {
  const exporter = new PDFProjectExporter(projectData, projectId, folderPaths);
  exporter.setProgressCallback(progressCallback);
  return exporter.generate(outputPath, compositeGenerator);
}

module.exports = {
  generateProjectPDF,
  PDFProjectExporter
};
