/**
 * React-PDF Project Export Module
 *
 * Generates a professional PDF report using @react-pdf/renderer.
 * This provides better layout control and working internal links.
 *
 * Note: Uses dynamic import because @react-pdf/renderer is ESM-only.
 */

const fs = require('fs');
const log = require('electron-log');

// Page dimensions (US Letter in points)
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;

// Colors
const COLORS = {
  primary: '#2C3E50',
  secondary: '#7F8C8D',
  accent: '#3498DB',
  text: '#333333',
  lightText: '#666666',
  border: '#BDC3C7',
  background: '#F8F9FA',
  white: '#FFFFFF'
};

/**
 * Format date value
 */
function formatDate(dateValue) {
  if (!dateValue) return null;
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return null;
  }
}

/**
 * Check if value should be displayed
 */
function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Check if instrument has data worth displaying
 */
function hasInstrumentData(instrument) {
  if (!instrument) return false;
  return Object.keys(instrument).some(k => hasValue(instrument[k]));
}

/**
 * Check if grain info has data
 */
function hasGrainData(grainInfo) {
  if (!grainInfo) return false;
  return grainInfo.grainSizeInfo?.length > 0 ||
         grainInfo.grainShapeInfo?.length > 0 ||
         hasValue(grainInfo.grainSizeNotes);
}

/**
 * Build TOC entries from project data
 */
function buildTOCEntries(project) {
  const entries = [];

  // Project details
  entries.push({ title: 'Project Details', anchor: 'project-details', level: 0 });

  let datasetIndex = 0;
  let sampleIndex = 0;
  let micrographIndex = 0;
  let spotIndex = 0;

  for (const dataset of project.datasets || []) {
    entries.push({
      title: `Dataset: ${dataset.name || 'Unnamed'}`,
      anchor: `dataset-${datasetIndex++}`,
      level: 0
    });

    for (const sample of dataset.samples || []) {
      entries.push({
        title: `Sample: ${sample.name || sample.label || 'Unnamed'}`,
        anchor: `sample-${sampleIndex++}`,
        level: 1
      });

      for (const micrograph of sample.micrographs || []) {
        entries.push({
          title: `Micrograph: ${micrograph.name || 'Unnamed'}`,
          anchor: `micrograph-${micrographIndex++}`,
          level: 1
        });

        for (const spot of micrograph.spots || []) {
          entries.push({
            title: `Spot: ${spot.name || 'Unnamed'}`,
            anchor: `spot-${spotIndex++}`,
            level: 2
          });
        }
      }
    }
  }

  return entries;
}

/**
 * Generate project PDF using React-PDF
 * Uses dynamic import for ESM compatibility
 */
async function generateProjectPDF(outputPath, projectData, projectId, folderPaths, compositeGenerator, progressCallback) {
  log.info('[ReactPDFExport] Starting PDF generation');

  // Dynamic import for ESM modules
  const React = await import('react');
  const ReactPDF = await import('@react-pdf/renderer');
  const { Document, Page, Text, View, Image, Link, StyleSheet, pdf } = ReactPDF;

  // Create styles
  const styles = StyleSheet.create({
    page: {
      padding: MARGIN,
      fontFamily: 'Helvetica',
      fontSize: 10,
      color: COLORS.text
    },
    // Cover page
    coverTitle: {
      fontSize: 32,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.primary,
      textAlign: 'center',
      marginTop: 150
    },
    coverSubtitle: {
      fontSize: 18,
      color: COLORS.secondary,
      textAlign: 'center',
      marginTop: 20
    },
    coverStats: {
      fontSize: 10,
      color: COLORS.text,
      textAlign: 'center',
      marginTop: 60
    },
    coverDate: {
      fontSize: 9,
      color: COLORS.lightText,
      textAlign: 'center',
      position: 'absolute',
      bottom: 50,
      left: MARGIN,
      right: MARGIN
    },
    coverLine: {
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
      marginHorizontal: 100,
      marginTop: 40
    },
    // TOC
    tocTitle: {
      fontSize: 18,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.primary,
      marginBottom: 20
    },
    tocEntry: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
      paddingLeft: 0
    },
    tocEntryLevel1: {
      paddingLeft: 15
    },
    tocEntryLevel2: {
      paddingLeft: 30
    },
    tocLink: {
      color: COLORS.accent,
      textDecoration: 'none',
      fontSize: 10,
      flex: 1
    },
    tocLinkSmall: {
      fontSize: 9
    },
    // Section headers
    sectionHeader: {
      fontSize: 18,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.primary,
      marginBottom: 5
    },
    sectionUnderline: {
      borderBottomWidth: 2,
      borderBottomColor: COLORS.accent,
      width: 150,
      marginBottom: 15
    },
    subsectionHeader: {
      fontSize: 14,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.primary,
      marginTop: 15,
      marginBottom: 8
    },
    breadcrumb: {
      fontSize: 9,
      color: COLORS.secondary,
      marginBottom: 5
    },
    // Content
    card: {
      marginBottom: 15,
      paddingLeft: 10
    },
    fieldRow: {
      flexDirection: 'row',
      marginBottom: 3
    },
    fieldLabel: {
      fontFamily: 'Helvetica-Bold',
      color: COLORS.primary,
      marginRight: 5
    },
    fieldValue: {
      color: COLORS.text,
      flex: 1
    },
    typeIndicator: {
      fontSize: 9,
      fontFamily: 'Helvetica-Oblique',
      color: COLORS.secondary,
      marginBottom: 8
    },
    listItem: {
      fontSize: 9,
      color: COLORS.text,
      marginLeft: 10,
      marginBottom: 2
    },
    listItemAccent: {
      fontSize: 9,
      color: COLORS.accent,
      marginLeft: 10,
      marginBottom: 2
    },
    note: {
      fontSize: 9,
      fontFamily: 'Helvetica-Oblique',
      color: COLORS.lightText,
      marginTop: 5
    },
    // Images
    micrographImage: {
      maxWidth: PAGE_WIDTH - (MARGIN * 2),
      maxHeight: 350,
      objectFit: 'contain',
      marginBottom: 15
    },
    // Page number
    pageNumber: {
      position: 'absolute',
      fontSize: 9,
      bottom: 25,
      left: 0,
      right: 0,
      textAlign: 'center',
      color: COLORS.lightText
    },
    // Back to TOC link
    backToToc: {
      fontSize: 9,
      color: COLORS.accent,
      textDecoration: 'none',
      marginBottom: 10
    },
    backToTocContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 5
    }
  });

  // Helper component functions
  const Field = ({ label, value }) => {
    if (!hasValue(value)) return null;
    return React.createElement(View, { style: styles.fieldRow },
      React.createElement(Text, { style: styles.fieldLabel }, `${label}:`),
      React.createElement(Text, { style: styles.fieldValue }, String(value))
    );
  };

  const SectionHeader = ({ title, id, showBackLink = true }) => {
    return React.createElement(View, { id },
      showBackLink && React.createElement(View, { style: styles.backToTocContainer },
        React.createElement(Link, { src: '#toc', style: styles.backToToc },
          React.createElement(Text, null, '← Back to Table of Contents')
        )
      ),
      React.createElement(Text, { style: styles.sectionHeader }, title),
      React.createElement(View, { style: styles.sectionUnderline })
    );
  };

  // Collect all entities
  const allDatasets = projectData.datasets || [];
  const allSamples = [];
  const allMicrographs = [];
  const allSpots = [];

  let sampleIndex = 0;
  let micrographIndex = 0;
  let spotIndex = 0;

  for (const dataset of allDatasets) {
    for (const sample of dataset.samples || []) {
      allSamples.push({ sample, dataset, index: sampleIndex++ });
      for (const micrograph of sample.micrographs || []) {
        allMicrographs.push({ micrograph, sample, dataset, index: micrographIndex++ });
        for (const spot of micrograph.spots || []) {
          allSpots.push({ spot, micrograph, sample, dataset, index: spotIndex++ });
        }
      }
    }
  }

  const stats = {
    datasets: allDatasets.length,
    samples: allSamples.length,
    micrographs: allMicrographs.length,
    spots: allSpots.length
  };

  const totalSteps = 2 + allMicrographs.length;
  let currentStep = 0;

  // Report initial progress
  if (progressCallback) {
    progressCallback({
      phase: 'Preparing document',
      current: ++currentStep,
      total: totalSteps,
      itemName: 'Building structure',
      percentage: Math.round((currentStep / totalSteps) * 100)
    });
  }

  // Build TOC entries
  const tocEntries = buildTOCEntries(projectData);

  // Generate micrograph images
  const micrographImages = [];
  if (compositeGenerator) {
    for (let i = 0; i < allMicrographs.length; i++) {
      const { micrograph } = allMicrographs[i];

      if (progressCallback) {
        progressCallback({
          phase: 'Generating micrograph images',
          current: ++currentStep,
          total: totalSteps,
          itemName: micrograph.name || `Micrograph ${i + 1}`,
          percentage: Math.round((currentStep / totalSteps) * 100)
        });
      }

      try {
        const imageBuffer = await compositeGenerator(projectId, micrograph, projectData, folderPaths);
        log.info(`[ReactPDFExport] Image generated for ${micrograph.name}: ${imageBuffer ? `${imageBuffer.length} bytes, type: ${typeof imageBuffer}, isBuffer: ${Buffer.isBuffer(imageBuffer)}` : 'null'}`);
        micrographImages.push(imageBuffer);
      } catch (err) {
        log.warn(`[ReactPDFExport] Could not generate image for ${micrograph.name}:`, err.message);
        micrographImages.push(null);
      }
    }
  }

  // Report PDF generation progress
  if (progressCallback) {
    progressCallback({
      phase: 'Generating PDF',
      current: ++currentStep,
      total: totalSteps,
      itemName: 'Rendering document',
      percentage: Math.round((currentStep / totalSteps) * 100)
    });
  }

  // Build pages array
  const pages = [];

  // Cover page
  pages.push(
    React.createElement(Page, { key: 'cover', size: 'LETTER', style: styles.page },
      React.createElement(Text, { style: styles.coverTitle }, projectData.name || 'Untitled Project'),
      React.createElement(Text, { style: styles.coverSubtitle }, 'StraboMicro Project Report'),
      React.createElement(View, { style: styles.coverLine }),
      React.createElement(Text, { style: styles.coverStats },
        `${stats.datasets} Dataset${stats.datasets !== 1 ? 's' : ''}  |  ` +
        `${stats.samples} Sample${stats.samples !== 1 ? 's' : ''}  |  ` +
        `${stats.micrographs} Micrograph${stats.micrographs !== 1 ? 's' : ''}  |  ` +
        `${stats.spots} Spot${stats.spots !== 1 ? 's' : ''}`
      ),
      React.createElement(Text, { style: styles.coverDate },
        `Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
      )
    )
  );

  // TOC page(s)
  const entriesPerPage = 35;
  for (let i = 0; i < tocEntries.length; i += entriesPerPage) {
    const pageEntries = tocEntries.slice(i, i + entriesPerPage);
    const isFirstTocPage = i === 0;

    const tocElements = [];
    if (isFirstTocPage) {
      // Add anchor for "Back to TOC" links
      tocElements.push(React.createElement(View, { key: 'toc-anchor', id: 'toc' }));
      tocElements.push(React.createElement(Text, { key: 'toc-title', style: styles.tocTitle }, 'Table of Contents'));
    }

    for (let j = 0; j < pageEntries.length; j++) {
      const entry = pageEntries[j];
      const entryStyle = [
        styles.tocEntry,
        entry.level === 1 ? styles.tocEntryLevel1 : null,
        entry.level === 2 ? styles.tocEntryLevel2 : null
      ].filter(Boolean);

      const linkStyle = [
        styles.tocLink,
        entry.level > 0 ? styles.tocLinkSmall : null
      ].filter(Boolean);

      tocElements.push(
        React.createElement(View, { key: `toc-entry-${i + j}`, style: entryStyle },
          React.createElement(Link, { src: `#${entry.anchor}`, style: linkStyle },
            React.createElement(Text, null, entry.title)
          )
        )
      );
    }

    tocElements.push(
      React.createElement(Text, {
        key: 'page-num',
        style: styles.pageNumber,
        render: ({ pageNumber }) => `${pageNumber}`
      })
    );

    pages.push(
      React.createElement(Page, { key: `toc-${i}`, size: 'LETTER', style: styles.page }, ...tocElements)
    );
  }

  // Project details page
  pages.push(
    React.createElement(Page, { key: 'project-details', size: 'LETTER', style: styles.page },
      React.createElement(SectionHeader, { title: 'Project Details', id: 'project-details' }),
      React.createElement(View, { style: styles.card },
        React.createElement(Field, { label: 'Project Name', value: projectData.name }),
        React.createElement(Field, { label: 'Start Date', value: formatDate(projectData.startDate) }),
        React.createElement(Field, { label: 'End Date', value: formatDate(projectData.endDate) }),
        React.createElement(Field, { label: 'Purpose of Study', value: projectData.purposeOfStudy }),
        React.createElement(Field, { label: 'Area of Interest', value: projectData.areaOfInterest }),
        React.createElement(Field, { label: 'Project Location', value: projectData.projectLocation }),
        React.createElement(Field, { label: 'Instruments Used', value: projectData.instrumentsUsed }),
        React.createElement(Field, { label: 'Team Members', value: projectData.otherTeamMembers }),
        React.createElement(Field, { label: 'GPS Datum', value: projectData.gpsDatum }),
        React.createElement(Field, { label: 'Magnetic Declination', value: projectData.magneticDeclination }),
        React.createElement(Field, { label: 'Date Created', value: formatDate(projectData.date) }),
        React.createElement(Field, { label: 'Last Modified', value: formatDate(projectData.modifiedTimestamp) }),
        React.createElement(Field, { label: 'Notes', value: projectData.notes })
      ),
      React.createElement(Text, {
        style: styles.pageNumber,
        render: ({ pageNumber }) => `${pageNumber}`
      })
    )
  );

  // Dataset pages
  allDatasets.forEach((dataset, i) => {
    const sampleCount = (dataset.samples || []).length;
    pages.push(
      React.createElement(Page, { key: `dataset-${i}`, size: 'LETTER', style: styles.page },
        React.createElement(SectionHeader, { title: `Dataset: ${dataset.name || 'Unnamed'}`, id: `dataset-${i}` }),
        React.createElement(View, { style: styles.card },
          React.createElement(Field, { label: 'Name', value: dataset.name }),
          React.createElement(Field, { label: 'Date Created', value: formatDate(dataset.date) }),
          React.createElement(Field, { label: 'Last Modified', value: formatDate(dataset.modifiedTimestamp) }),
          React.createElement(Text, { style: { marginTop: 10 } },
            `Contains ${sampleCount} sample${sampleCount !== 1 ? 's' : ''}`
          )
        ),
        React.createElement(Text, {
          style: styles.pageNumber,
          render: ({ pageNumber }) => `${pageNumber}`
        })
      )
    );
  });

  // Sample pages
  allSamples.forEach(({ sample, dataset, index }) => {
    const sampleName = sample.name || sample.label || 'Unnamed';
    const microCount = (sample.micrographs || []).length;

    pages.push(
      React.createElement(Page, { key: `sample-${index}`, size: 'LETTER', style: styles.page },
        React.createElement(Text, { style: styles.breadcrumb }, dataset.name || 'Dataset'),
        React.createElement(SectionHeader, { title: `Sample: ${sampleName}`, id: `sample-${index}` }),
        React.createElement(View, { style: styles.card },
          React.createElement(Field, { label: 'Label', value: sample.label }),
          React.createElement(Field, { label: 'Sample ID', value: sample.sampleID }),
          React.createElement(Field, { label: 'Latitude', value: sample.latitude }),
          React.createElement(Field, { label: 'Longitude', value: sample.longitude }),
          React.createElement(Field, { label: 'Sampling Purpose', value: sample.mainSamplingPurpose }),
          React.createElement(Field, { label: 'Description', value: sample.sampleDescription }),
          React.createElement(Field, { label: 'Material Type', value: sample.materialType }),
          React.createElement(Field, { label: 'Sample Type', value: sample.sampleType }),
          React.createElement(Field, { label: 'Lithology', value: sample.lithology }),
          React.createElement(Field, { label: 'Color', value: sample.color }),
          React.createElement(Field, { label: 'Sample Size', value: sample.sampleSize }),
          React.createElement(Field, { label: 'Degree of Weathering', value: sample.degreeOfWeathering }),
          React.createElement(Field, { label: 'Inplaceness', value: sample.inplacenessOfSample }),
          React.createElement(Field, { label: 'Oriented Sample', value: sample.orientedSample }),
          React.createElement(Field, { label: 'Orientation Notes', value: sample.sampleOrientationNotes }),
          React.createElement(Field, { label: 'Sample Unit', value: sample.sampleUnit }),
          React.createElement(Field, { label: 'Notes', value: sample.sampleNotes }),
          React.createElement(Text, { style: { marginTop: 10 } },
            `Contains ${microCount} micrograph${microCount !== 1 ? 's' : ''}`
          )
        ),
        React.createElement(Text, {
          style: styles.pageNumber,
          render: ({ pageNumber }) => `${pageNumber}`
        })
      )
    );
  });

  // Micrograph pages
  allMicrographs.forEach(({ micrograph, sample, dataset, index }) => {
    const micrographName = micrograph.name || 'Unnamed';
    const isReference = !micrograph.parentID;
    const breadcrumb = `${dataset.name || 'Dataset'} > ${sample.name || sample.label || 'Sample'}`;

    // Convert buffer to base64 data URI for react-pdf
    // Note: generateCompositeBuffer returns JPEG format
    let imageDataUri = null;
    const imageBuffer = micrographImages[index];
    if (imageBuffer) {
      const base64 = Buffer.isBuffer(imageBuffer) ? imageBuffer.toString('base64') : Buffer.from(imageBuffer).toString('base64');
      imageDataUri = `data:image/jpeg;base64,${base64}`;
      log.info(`[ReactPDFExport] Created data URI for ${micrographName}: length=${base64.length} chars`);
    } else {
      log.warn(`[ReactPDFExport] No image buffer for micrograph index ${index}: ${micrographName}`);
    }

    const pageElements = [
      React.createElement(Text, { key: 'breadcrumb', style: styles.breadcrumb }, breadcrumb),
      React.createElement(SectionHeader, { key: 'header', title: `Micrograph: ${micrographName}`, id: `micrograph-${index}` }),
      React.createElement(Text, { key: 'type', style: styles.typeIndicator },
        isReference ? 'Reference Micrograph' : 'Associated Micrograph'
      )
    ];

    // Image
    if (imageDataUri) {
      pageElements.push(
        React.createElement(Image, { key: 'image', src: imageDataUri, style: styles.micrographImage })
      );
    }

    // Basic metadata
    pageElements.push(
      React.createElement(View, { key: 'card', style: styles.card },
        React.createElement(Field, { label: 'Name', value: micrograph.name }),
        React.createElement(Field, { label: 'Image Type', value: micrograph.imageType }),
        React.createElement(Field, { label: 'Width (px)', value: micrograph.width }),
        React.createElement(Field, { label: 'Height (px)', value: micrograph.height }),
        React.createElement(Field, { label: 'Scale (px/cm)', value: micrograph.scalePixelsPerCentimeter }),
        React.createElement(Field, { label: 'Scale Description', value: micrograph.scale }),
        React.createElement(Field, { label: 'Description', value: micrograph.description }),
        React.createElement(Field, { label: 'Notes', value: micrograph.notes }),
        React.createElement(Field, { label: 'Polish', value: micrograph.polish ? 'Yes' : null }),
        React.createElement(Field, { label: 'Polish Description', value: micrograph.polishDescription })
      )
    );

    // Instrument info
    if (micrograph.instrument && hasInstrumentData(micrograph.instrument)) {
      pageElements.push(
        React.createElement(View, { key: 'instrument' },
          React.createElement(Text, { style: styles.subsectionHeader }, 'Instrument Information'),
          React.createElement(View, { style: styles.card },
            React.createElement(Field, { label: 'Instrument Type', value: micrograph.instrument.instrumentType }),
            React.createElement(Field, { label: 'Data Type', value: micrograph.instrument.dataType }),
            React.createElement(Field, { label: 'Brand', value: micrograph.instrument.instrumentBrand }),
            React.createElement(Field, { label: 'Model', value: micrograph.instrument.instrumentModel }),
            React.createElement(Field, { label: 'University', value: micrograph.instrument.university }),
            React.createElement(Field, { label: 'Laboratory', value: micrograph.instrument.laboratory }),
            React.createElement(Field, { label: 'Acceleration Voltage', value: micrograph.instrument.accelerationVoltage }),
            React.createElement(Field, { label: 'Beam Current', value: micrograph.instrument.beamCurrent }),
            React.createElement(Field, { label: 'Working Distance', value: micrograph.instrument.workingDistance }),
            React.createElement(Field, { label: 'Notes', value: micrograph.instrument.instrumentNotes })
          )
        )
      );
    }

    // Spots summary
    if (micrograph.spots && micrograph.spots.length > 0) {
      const spotElements = [
        React.createElement(Text, { key: 'spots-header', style: styles.subsectionHeader }, 'Spots'),
        React.createElement(Text, { key: 'spots-count' },
          `This micrograph contains ${micrograph.spots.length} spot${micrograph.spots.length !== 1 ? 's' : ''}:`
        )
      ];

      micrograph.spots.forEach((spot, i) => {
        spotElements.push(
          React.createElement(Text, { key: `spot-${i}`, style: styles.listItemAccent },
            `• ${spot.name || 'Unnamed Spot'}`
          )
        );
      });

      pageElements.push(React.createElement(View, { key: 'spots' }, ...spotElements));
    }

    // Page number
    pageElements.push(
      React.createElement(Text, {
        key: 'page-num',
        style: styles.pageNumber,
        render: ({ pageNumber }) => `${pageNumber}`
      })
    );

    pages.push(
      React.createElement(Page, { key: `micrograph-${index}`, size: 'LETTER', style: styles.page }, ...pageElements)
    );
  });

  // Spot pages
  allSpots.forEach(({ spot, micrograph, sample, dataset, index }) => {
    const spotName = spot.name || 'Unnamed';
    const breadcrumb = `${dataset.name || 'Dataset'} > ${sample.name || sample.label || 'Sample'} > ${micrograph.name || 'Micrograph'}`;

    const pageElements = [
      React.createElement(Text, { key: 'breadcrumb', style: styles.breadcrumb }, breadcrumb),
      React.createElement(SectionHeader, { key: 'header', title: `Spot: ${spotName}`, id: `spot-${index}` }),
      React.createElement(View, { key: 'card', style: styles.card },
        React.createElement(Field, { label: 'Name', value: spot.name }),
        React.createElement(Field, { label: 'Geometry Type', value: spot.geometryType }),
        React.createElement(Field, { label: 'Color', value: spot.color }),
        React.createElement(Field, { label: 'Label Color', value: spot.labelColor }),
        React.createElement(Field, { label: 'Date', value: formatDate(spot.date) }),
        React.createElement(Field, { label: 'Time', value: spot.time }),
        React.createElement(Field, { label: 'Last Modified', value: formatDate(spot.modifiedTimestamp) }),
        React.createElement(Field, { label: 'Notes', value: spot.notes }),
        spot.tags && spot.tags.length > 0 ?
          React.createElement(View, { style: styles.fieldRow },
            React.createElement(Text, { style: styles.fieldLabel }, 'Tags:'),
            React.createElement(Text, { style: styles.fieldValue }, spot.tags.join(', '))
          ) : null
      )
    ];

    // Mineralogy
    if (spot.mineralogy && (spot.mineralogy.minerals?.length > 0 || hasValue(spot.mineralogy.notes))) {
      const mineralogyElements = [
        React.createElement(Text, { key: 'min-header', style: styles.subsectionHeader }, 'Mineralogy')
      ];

      const cardElements = [];
      if (hasValue(spot.mineralogy.mineralogyMethod)) {
        cardElements.push(React.createElement(Field, { key: 'method', label: 'Method', value: spot.mineralogy.mineralogyMethod }));
      }

      if (spot.mineralogy.minerals) {
        spot.mineralogy.minerals.forEach((mineral, i) => {
          const percentage = hasValue(mineral.percentage) ? ` (${mineral.operator || ''}${mineral.percentage}%)` : '';
          cardElements.push(
            React.createElement(Text, { key: `mineral-${i}`, style: styles.listItem },
              `• ${mineral.name || 'Unknown'}${percentage}`
            )
          );
        });
      }

      if (hasValue(spot.mineralogy.notes)) {
        cardElements.push(React.createElement(Text, { key: 'notes', style: styles.note }, `Notes: ${spot.mineralogy.notes}`));
      }

      mineralogyElements.push(React.createElement(View, { key: 'min-card', style: styles.card }, ...cardElements));
      pageElements.push(React.createElement(View, { key: 'mineralogy' }, ...mineralogyElements));
    }

    // Grain Info
    if (spot.grainInfo && hasGrainData(spot.grainInfo)) {
      const grainElements = [
        React.createElement(Text, { key: 'grain-header', style: styles.subsectionHeader }, 'Grain Information')
      ];

      const cardElements = [];
      if (spot.grainInfo.grainSizeInfo) {
        spot.grainInfo.grainSizeInfo.forEach((size, i) => {
          const phases = size.phases?.join(', ') || 'All phases';
          const stats = [];
          if (hasValue(size.mean)) stats.push(`Mean: ${size.mean}`);
          if (hasValue(size.median)) stats.push(`Median: ${size.median}`);
          cardElements.push(
            React.createElement(Text, { key: `size-${i}`, style: styles.listItem },
              `• ${phases}: ${stats.join(', ')} ${size.sizeUnit || ''}`
            )
          );
        });
      }

      if (hasValue(spot.grainInfo.grainSizeNotes)) {
        cardElements.push(React.createElement(Text, { key: 'notes', style: styles.note }, `Notes: ${spot.grainInfo.grainSizeNotes}`));
      }

      grainElements.push(React.createElement(View, { key: 'grain-card', style: styles.card }, ...cardElements));
      pageElements.push(React.createElement(View, { key: 'grain' }, ...grainElements));
    }

    // Fabric Info
    if (spot.fabricInfo && (spot.fabricInfo.fabrics?.length > 0 || hasValue(spot.fabricInfo.notes))) {
      const fabricElements = [
        React.createElement(Text, { key: 'fabric-header', style: styles.subsectionHeader }, 'Fabric Information')
      ];

      const cardElements = [];
      if (spot.fabricInfo.fabrics) {
        spot.fabricInfo.fabrics.forEach((fabric, i) => {
          cardElements.push(
            React.createElement(Text, { key: `fabric-${i}`, style: styles.listItem },
              `• ${fabric.fabricLabel || fabric.fabricElement || 'Fabric'}: ${fabric.fabricCategory || ''}`
            )
          );
        });
      }

      if (hasValue(spot.fabricInfo.notes)) {
        cardElements.push(React.createElement(Text, { key: 'notes', style: styles.note }, `Notes: ${spot.fabricInfo.notes}`));
      }

      fabricElements.push(React.createElement(View, { key: 'fabric-card', style: styles.card }, ...cardElements));
      pageElements.push(React.createElement(View, { key: 'fabric' }, ...fabricElements));
    }

    // Page number
    pageElements.push(
      React.createElement(Text, {
        key: 'page-num',
        style: styles.pageNumber,
        render: ({ pageNumber }) => `${pageNumber}`
      })
    );

    pages.push(
      React.createElement(Page, { key: `spot-${index}`, size: 'LETTER', style: styles.page }, ...pageElements)
    );
  });

  // Create document
  const documentElement = React.createElement(Document, {
    title: `${projectData.name || 'Project'} - StraboMicro Report`,
    author: 'StraboMicro',
    subject: 'Geological Microanalysis Report',
    creator: 'StraboMicro2'
  }, ...pages);

  // Render to PDF using renderToFile for Node.js
  // Note: pdf().toBuffer() doesn't work the same way in ESM
  const { renderToFile } = ReactPDF;
  await renderToFile(documentElement, outputPath);

  log.info(`[ReactPDFExport] PDF generated successfully: ${outputPath}`);
  return outputPath;
}

module.exports = {
  generateProjectPDF
};
