const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate a PDF with detailed notes from a micrograph or spot
 *
 * @param {string} outputPath - Full path where PDF should be saved
 * @param {object} projectData - Complete project data
 * @param {string} micrographId - ID of micrograph (if micrograph notes)
 * @param {string} spotId - ID of spot (if spot notes)
 */
function generateDetailedNotesPDF(outputPath, projectData, micrographId, spotId) {
  return new Promise((resolve, reject) => {
    try {
      // Create PDF document
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: {
          top: 72,
          bottom: 72,
          left: 72,
          right: 72
        },
        info: {
          Title: 'StraboMicro Detailed Notes',
          Author: 'StraboMicro',
          Subject: 'StraboMicro',
          Keywords: 'StraboMicro, Strabo',
          Creator: 'StraboMicro'
        }
      });

      // Pipe to file
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Find the entity (micrograph or spot) and its parents
      let entity = null;
      let sample = null;
      let entityType = null;
      let entityName = '';

      if (micrographId) {
        // Find micrograph
        for (const dataset of projectData.datasets || []) {
          for (const samp of dataset.samples || []) {
            const micrograph = samp.micrographs?.find(m => m.id === micrographId);
            if (micrograph) {
              entity = micrograph;
              sample = samp;
              entityType = 'Micrograph';
              entityName = micrograph.name || 'Unnamed Micrograph';
              break;
            }
          }
          if (entity) break;
        }
      } else if (spotId) {
        // Find spot (implementation depends on where spots are stored)
        // For now, assuming spots might be in a spots array somewhere
        entityType = 'Spot';
        entityName = 'Unnamed Spot';
      }

      if (!entity) {
        doc.end();
        return reject(new Error('Entity not found'));
      }

      // Add heading
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .text(`Detailed Notes for ${entityType} ${entityName}`, {
           align: 'left'
         });

      doc.moveDown(1.5);

      // Helper function to add a note section
      const addNoteSection = (label, noteText) => {
        if (!noteText || noteText.trim() === '') return;

        // Check if we need a new page
        if (doc.y > 650) {
          doc.addPage();
        }

        // Add label (bold, underlined)
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .text(label, {
             underline: true,
             continued: false
           });

        doc.moveDown(0.3);

        // Add note text (regular font, indented)
        doc.fontSize(10)
           .font('Helvetica')
           .text(noteText, {
             indent: 15,
             align: 'left',
             lineGap: 2
           });

        doc.moveDown(1);
      };

      // Add all note sections (in order from legacy app)

      // Project notes
      if (projectData.notes) {
        addNoteSection('Project Notes:', projectData.notes);
      }

      // Sample notes
      if (sample?.sampleNotes) {
        addNoteSection('Sample Notes:', sample.sampleNotes);
      }

      // Micrograph/Spot notes
      if (entityType === 'Micrograph') {
        if (entity.notes) {
          addNoteSection('Micrograph Notes:', entity.notes);
        }

        // Polish description
        if (entity.polishDescription) {
          addNoteSection('Polish Description:', entity.polishDescription);
        }

        // Instrument notes
        if (entity.instrument?.instrumentNotes) {
          addNoteSection('Instrument Notes:', entity.instrument.instrumentNotes);
        }

        // Post processing notes
        if (entity.instrument?.notesOnPostProcessing) {
          addNoteSection('Post Processing Notes:', entity.instrument.notesOnPostProcessing);
        }
      } else {
        if (entity.notes) {
          addNoteSection('Spot Notes:', entity.notes);
        }
      }

      // Mineralogy notes
      if (entity.mineralogy?.notes) {
        addNoteSection('Mineralogy Notes:', entity.mineralogy.notes);
      }

      // Lithology notes
      if (entity.lithologyInfo?.notes) {
        addNoteSection('Lithology Notes:', entity.lithologyInfo.notes);
      }

      // Grain size notes
      if (entity.grainInfo?.grainSizeNotes) {
        addNoteSection('Grain Size Notes:', entity.grainInfo.grainSizeNotes);
      }

      // Grain shape notes
      if (entity.grainInfo?.grainShapeNotes) {
        addNoteSection('Grain Shape Notes:', entity.grainInfo.grainShapeNotes);
      }

      // Grain orientation notes
      if (entity.grainInfo?.grainOrientationNotes) {
        addNoteSection('Grain Orientation Notes:', entity.grainInfo.grainOrientationNotes);
      }

      // Fabric notes
      if (entity.fabricInfo?.notes) {
        addNoteSection('Fabric Notes:', entity.fabricInfo.notes);
      }

      // Clastic deformation band notes
      if (entity.clasticDeformationBandInfo?.notes) {
        addNoteSection('Clastic Deformation Band Notes:', entity.clasticDeformationBandInfo.notes);
      }

      // Grain boundary notes
      if (entity.grainBoundaryInfo?.notes) {
        addNoteSection('Grain Boundary/Contact Notes:', entity.grainBoundaryInfo.notes);
      }

      // Intragrain notes
      if (entity.intraGrainInfo?.notes) {
        addNoteSection('Intragrain (Single Grain) Notes:', entity.intraGrainInfo.notes);
      }

      // Vein notes
      if (entity.veinInfo?.notes) {
        addNoteSection('Vein Notes:', entity.veinInfo.notes);
      }

      // Pseudotachylyte notes
      if (entity.pseudotachylyteInfo?.notes) {
        addNoteSection('Pseudotachylyte Notes:', entity.pseudotachylyteInfo.notes);
      }

      // Fold notes
      if (entity.foldInfo?.notes) {
        addNoteSection('Fold Notes:', entity.foldInfo.notes);
      }

      // Faults/Shear zones notes
      if (entity.faultsShearZonesInfo?.notes) {
        addNoteSection('Faults/Shear Zones Notes:', entity.faultsShearZonesInfo.notes);
      }

      // Extinction microstructures notes
      if (entity.extinctionMicrostructureInfo?.notes) {
        addNoteSection('Extinction Microstructures Notes:', entity.extinctionMicrostructureInfo.notes);
      }

      // Fracture notes
      if (entity.fractureInfo?.notes) {
        addNoteSection('Fracture Notes:', entity.fractureInfo.notes);
      }

      // Finalize PDF
      doc.end();

      stream.on('finish', () => {
        resolve(outputPath);
      });

      stream.on('error', (err) => {
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateDetailedNotesPDF
};
