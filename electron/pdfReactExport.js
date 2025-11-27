/**
 * React-PDF Project Export Module
 *
 * Generates a professional PDF report using @react-pdf/renderer.
 * This provides better layout control and working internal links.
 */

const React = require('react');
const { Document, Page, Text, View, Image, Link, StyleSheet, pdf } = require('@react-pdf/renderer');
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

// Styles
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
  tocPage: {
    color: COLORS.accent,
    fontSize: 10,
    width: 30,
    textAlign: 'right'
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
  imageCaption: {
    fontSize: 8,
    color: COLORS.lightText,
    fontFamily: 'Helvetica-Oblique',
    textAlign: 'center',
    marginTop: -10,
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
  }
});

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
 * Field component - displays label: value pair
 */
function Field({ label, value }) {
  if (!hasValue(value)) return null;
  return React.createElement(View, { style: styles.fieldRow },
    React.createElement(Text, { style: styles.fieldLabel }, `${label}:`),
    React.createElement(Text, { style: styles.fieldValue }, String(value))
  );
}

/**
 * Cover Page component
 */
function CoverPage({ project, stats }) {
  return React.createElement(Page, { size: "LETTER", style: styles.page },
    React.createElement(Text, { style: styles.coverTitle }, project.name || 'Untitled Project'),
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
  );
}

/**
 * TOC Entry component
 */
function TOCEntry({ title, anchor, level }) {
  const entryStyle = [
    styles.tocEntry,
    level === 1 ? styles.tocEntryLevel1 : null,
    level === 2 ? styles.tocEntryLevel2 : null
  ].filter(Boolean);

  const linkStyle = [
    styles.tocLink,
    level > 0 ? styles.tocLinkSmall : null
  ].filter(Boolean);

  return React.createElement(View, { style: entryStyle },
    React.createElement(Link, { src: `#${anchor}`, style: linkStyle },
      React.createElement(Text, null, title)
    )
  );
}

/**
 * TOC Page component
 */
function TOCPage({ entries }) {
  // Split entries into chunks for pagination if needed
  const entriesPerPage = 35;
  const pages = [];
  for (let i = 0; i < entries.length; i += entriesPerPage) {
    pages.push(entries.slice(i, i + entriesPerPage));
  }

  return pages.map((pageEntries, pageIndex) =>
    React.createElement(Page, { key: `toc-${pageIndex}`, size: "LETTER", style: styles.page },
      pageIndex === 0 && React.createElement(Text, { style: styles.tocTitle }, 'Table of Contents'),
      ...pageEntries.map((entry, i) =>
        React.createElement(TOCEntry, {
          key: `entry-${i}`,
          title: entry.title,
          anchor: entry.anchor,
          level: entry.level
        })
      ),
      React.createElement(Text, {
        style: styles.pageNumber,
        render: ({ pageNumber }) => `${pageNumber}`
      })
    )
  );
}

/**
 * Section Header component
 */
function SectionHeader({ title, id }) {
  return React.createElement(View, { id },
    React.createElement(Text, { style: styles.sectionHeader }, title),
    React.createElement(View, { style: styles.sectionUnderline })
  );
}

/**
 * Project Details Page
 */
function ProjectDetailsPage({ project }) {
  return React.createElement(Page, { size: "LETTER", style: styles.page },
    React.createElement(SectionHeader, { title: 'Project Details', id: 'project-details' }),
    React.createElement(View, { style: styles.card },
      React.createElement(Field, { label: 'Project Name', value: project.name }),
      React.createElement(Field, { label: 'Start Date', value: formatDate(project.startDate) }),
      React.createElement(Field, { label: 'End Date', value: formatDate(project.endDate) }),
      React.createElement(Field, { label: 'Purpose of Study', value: project.purposeOfStudy }),
      React.createElement(Field, { label: 'Area of Interest', value: project.areaOfInterest }),
      React.createElement(Field, { label: 'Project Location', value: project.projectLocation }),
      React.createElement(Field, { label: 'Instruments Used', value: project.instrumentsUsed }),
      React.createElement(Field, { label: 'Team Members', value: project.otherTeamMembers }),
      React.createElement(Field, { label: 'GPS Datum', value: project.gpsDatum }),
      React.createElement(Field, { label: 'Magnetic Declination', value: project.magneticDeclination }),
      React.createElement(Field, { label: 'Date Created', value: formatDate(project.date) }),
      React.createElement(Field, { label: 'Last Modified', value: formatDate(project.modifiedTimestamp) }),
      React.createElement(Field, { label: 'Notes', value: project.notes })
    ),
    React.createElement(Text, {
      style: styles.pageNumber,
      render: ({ pageNumber }) => `${pageNumber}`
    })
  );
}

/**
 * Dataset Page
 */
function DatasetPage({ dataset, index }) {
  const sampleCount = (dataset.samples || []).length;

  return React.createElement(Page, { size: "LETTER", style: styles.page },
    React.createElement(SectionHeader, {
      title: `Dataset: ${dataset.name || 'Unnamed'}`,
      id: `dataset-${index}`
    }),
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
  );
}

/**
 * Sample Page
 */
function SamplePage({ sample, dataset, index }) {
  const sampleName = sample.name || sample.label || 'Unnamed';
  const microCount = (sample.micrographs || []).length;

  return React.createElement(Page, { size: "LETTER", style: styles.page },
    React.createElement(Text, { style: styles.breadcrumb }, dataset.name || 'Dataset'),
    React.createElement(SectionHeader, {
      title: `Sample: ${sampleName}`,
      id: `sample-${index}`
    }),
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
  );
}

/**
 * Micrograph Page
 */
function MicrographPage({ micrograph, sample, dataset, index, imageBuffer }) {
  const micrographName = micrograph.name || 'Unnamed';
  const isReference = !micrograph.parentID;
  const breadcrumb = `${dataset.name || 'Dataset'} > ${sample.name || sample.label || 'Sample'}`;

  // Convert buffer to base64 data URI for react-pdf
  let imageDataUri = null;
  if (imageBuffer) {
    const base64 = imageBuffer.toString('base64');
    imageDataUri = `data:image/png;base64,${base64}`;
  }

  return React.createElement(Page, { size: "LETTER", style: styles.page },
    React.createElement(Text, { style: styles.breadcrumb }, breadcrumb),
    React.createElement(SectionHeader, {
      title: `Micrograph: ${micrographName}`,
      id: `micrograph-${index}`
    }),
    React.createElement(Text, { style: styles.typeIndicator },
      isReference ? 'Reference Micrograph' : 'Associated Micrograph'
    ),

    // Image
    imageDataUri && React.createElement(Image, {
      src: imageDataUri,
      style: styles.micrographImage
    }),

    // Basic metadata
    React.createElement(View, { style: styles.card },
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
    ),

    // Instrument info
    micrograph.instrument && hasInstrumentData(micrograph.instrument) &&
      React.createElement(View, null,
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
      ),

    // Spots summary
    micrograph.spots && micrograph.spots.length > 0 &&
      React.createElement(View, null,
        React.createElement(Text, { style: styles.subsectionHeader }, 'Spots'),
        React.createElement(Text, null,
          `This micrograph contains ${micrograph.spots.length} spot${micrograph.spots.length !== 1 ? 's' : ''}:`
        ),
        ...micrograph.spots.map((spot, i) =>
          React.createElement(Text, { key: i, style: styles.listItemAccent },
            `• ${spot.name || 'Unnamed Spot'}`
          )
        )
      ),

    React.createElement(Text, {
      style: styles.pageNumber,
      render: ({ pageNumber }) => `${pageNumber}`
    })
  );
}

/**
 * Check if instrument has data worth displaying
 */
function hasInstrumentData(instrument) {
  if (!instrument) return false;
  return Object.keys(instrument).some(k => hasValue(instrument[k]));
}

/**
 * Spot Page
 */
function SpotPage({ spot, micrograph, sample, dataset, index }) {
  const spotName = spot.name || 'Unnamed';
  const breadcrumb = `${dataset.name || 'Dataset'} > ${sample.name || sample.label || 'Sample'} > ${micrograph.name || 'Micrograph'}`;

  return React.createElement(Page, { size: "LETTER", style: styles.page },
    React.createElement(Text, { style: styles.breadcrumb }, breadcrumb),
    React.createElement(SectionHeader, {
      title: `Spot: ${spotName}`,
      id: `spot-${index}`
    }),

    // Basic info
    React.createElement(View, { style: styles.card },
      React.createElement(Field, { label: 'Name', value: spot.name }),
      React.createElement(Field, { label: 'Geometry Type', value: spot.geometryType }),
      React.createElement(Field, { label: 'Color', value: spot.color }),
      React.createElement(Field, { label: 'Label Color', value: spot.labelColor }),
      React.createElement(Field, { label: 'Date', value: formatDate(spot.date) }),
      React.createElement(Field, { label: 'Time', value: spot.time }),
      React.createElement(Field, { label: 'Last Modified', value: formatDate(spot.modifiedTimestamp) }),
      React.createElement(Field, { label: 'Notes', value: spot.notes }),

      // Tags
      spot.tags && spot.tags.length > 0 &&
        React.createElement(View, { style: styles.fieldRow },
          React.createElement(Text, { style: styles.fieldLabel }, 'Tags:'),
          React.createElement(Text, { style: styles.fieldValue }, spot.tags.join(', '))
        )
    ),

    // Mineralogy
    spot.mineralogy && (spot.mineralogy.minerals?.length > 0 || hasValue(spot.mineralogy.notes)) &&
      React.createElement(View, null,
        React.createElement(Text, { style: styles.subsectionHeader }, 'Mineralogy'),
        React.createElement(View, { style: styles.card },
          hasValue(spot.mineralogy.mineralogyMethod) &&
            React.createElement(Field, { label: 'Method', value: spot.mineralogy.mineralogyMethod }),
          spot.mineralogy.minerals && spot.mineralogy.minerals.map((mineral, i) => {
            const percentage = hasValue(mineral.percentage) ? ` (${mineral.operator || ''}${mineral.percentage}%)` : '';
            return React.createElement(Text, { key: i, style: styles.listItem },
              `• ${mineral.name || 'Unknown'}${percentage}`
            );
          }),
          hasValue(spot.mineralogy.notes) &&
            React.createElement(Text, { style: styles.note }, `Notes: ${spot.mineralogy.notes}`)
        )
      ),

    // Grain Info
    spot.grainInfo && hasGrainData(spot.grainInfo) &&
      React.createElement(View, null,
        React.createElement(Text, { style: styles.subsectionHeader }, 'Grain Information'),
        React.createElement(View, { style: styles.card },
          spot.grainInfo.grainSizeInfo && spot.grainInfo.grainSizeInfo.map((size, i) => {
            const phases = size.phases?.join(', ') || 'All phases';
            const stats = [];
            if (hasValue(size.mean)) stats.push(`Mean: ${size.mean}`);
            if (hasValue(size.median)) stats.push(`Median: ${size.median}`);
            return React.createElement(Text, { key: i, style: styles.listItem },
              `• ${phases}: ${stats.join(', ')} ${size.sizeUnit || ''}`
            );
          }),
          hasValue(spot.grainInfo.grainSizeNotes) &&
            React.createElement(Text, { style: styles.note }, `Notes: ${spot.grainInfo.grainSizeNotes}`)
        )
      ),

    // Fabric Info
    spot.fabricInfo && (spot.fabricInfo.fabrics?.length > 0 || hasValue(spot.fabricInfo.notes)) &&
      React.createElement(View, null,
        React.createElement(Text, { style: styles.subsectionHeader }, 'Fabric Information'),
        React.createElement(View, { style: styles.card },
          spot.fabricInfo.fabrics && spot.fabricInfo.fabrics.map((fabric, i) =>
            React.createElement(Text, { key: i, style: styles.listItem },
              `• ${fabric.fabricLabel || fabric.fabricElement || 'Fabric'}: ${fabric.fabricCategory || ''}`
            )
          ),
          hasValue(spot.fabricInfo.notes) &&
            React.createElement(Text, { style: styles.note }, `Notes: ${spot.fabricInfo.notes}`)
        )
      ),

    React.createElement(Text, {
      style: styles.pageNumber,
      render: ({ pageNumber }) => `${pageNumber}`
    })
  );
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
 * Main document component
 */
function ProjectDocument({ project, tocEntries, micrographImages }) {
  // Collect all entities
  const allDatasets = project.datasets || [];
  const allSamples = [];
  const allMicrographs = [];
  const allSpots = [];

  let datasetIndex = 0;
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

  return React.createElement(Document, {
    title: `${project.name || 'Project'} - StraboMicro Report`,
    author: 'StraboMicro',
    subject: 'Geological Microanalysis Report',
    creator: 'StraboMicro2'
  },
    // Cover page
    React.createElement(CoverPage, { project, stats }),

    // TOC
    ...TOCPage({ entries: tocEntries }),

    // Project details
    React.createElement(ProjectDetailsPage, { project }),

    // Datasets
    ...allDatasets.map((dataset, i) =>
      React.createElement(DatasetPage, { key: `dataset-${i}`, dataset, index: i })
    ),

    // Samples
    ...allSamples.map(({ sample, dataset, index }) =>
      React.createElement(SamplePage, { key: `sample-${index}`, sample, dataset, index })
    ),

    // Micrographs
    ...allMicrographs.map(({ micrograph, sample, dataset, index }) =>
      React.createElement(MicrographPage, {
        key: `micrograph-${index}`,
        micrograph,
        sample,
        dataset,
        index,
        imageBuffer: micrographImages ? micrographImages[index] : null
      })
    ),

    // Spots
    ...allSpots.map(({ spot, micrograph, sample, dataset, index }) =>
      React.createElement(SpotPage, { key: `spot-${index}`, spot, micrograph, sample, dataset, index })
    )
  );
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
 */
async function generateProjectPDF(outputPath, projectData, projectId, folderPaths, compositeGenerator, progressCallback) {
  log.info('[ReactPDFExport] Starting PDF generation');

  // Collect all micrographs for image generation
  const allMicrographs = [];
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        allMicrographs.push(micrograph);
      }
    }
  }

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
      const micrograph = allMicrographs[i];

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

  // Create document element
  const documentElement = React.createElement(ProjectDocument, {
    project: projectData,
    tocEntries,
    micrographImages
  });

  // Render to PDF
  const pdfInstance = pdf(documentElement);
  const pdfBuffer = await pdfInstance.toBuffer();

  // Write to file
  fs.writeFileSync(outputPath, pdfBuffer);

  log.info(`[ReactPDFExport] PDF generated successfully: ${outputPath}`);
  return outputPath;
}

module.exports = {
  generateProjectPDF
};
