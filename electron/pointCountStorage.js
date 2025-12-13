/**
 * Point Count Storage Service
 *
 * Handles persistence of Point Count sessions to disk.
 * Sessions are stored as individual JSON files in the project's point-counts/ folder.
 *
 * Storage Location:
 * ~/Documents/StraboMicro2Data/<projectId>/point-counts/<sessionId>.json
 */

const fs = require('fs');
const path = require('path');
const { getProjectFolderPath } = require('./projectFolders');

/**
 * Get the path to the point-counts folder for a project
 * @param {string} projectId - Project UUID
 * @returns {string} Path to point-counts folder
 */
function getPointCountsFolder(projectId) {
  return path.join(getProjectFolderPath(projectId), 'point-counts');
}

/**
 * Get the path to a specific session file
 * @param {string} projectId - Project UUID
 * @param {string} sessionId - Session UUID
 * @returns {string} Path to session JSON file
 */
function getSessionFilePath(projectId, sessionId) {
  return path.join(getPointCountsFolder(projectId), `${sessionId}.json`);
}

/**
 * Ensure the point-counts folder exists for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<string>} Path to point-counts folder
 */
async function ensurePointCountsFolder(projectId) {
  const folderPath = getPointCountsFolder(projectId);

  try {
    await fs.promises.access(folderPath, fs.constants.F_OK);
  } catch (error) {
    // Folder doesn't exist, create it
    console.log(`[PointCountStorage] Creating point-counts folder for project: ${projectId}`);
    await fs.promises.mkdir(folderPath, { recursive: true });
  }

  return folderPath;
}

/**
 * Calculate summary statistics from points array
 * @param {Array} points - Array of point objects
 * @returns {Object} Summary with totalPoints, classifiedCount, and modalComposition
 */
function calculateSummary(points) {
  const modalComposition = {};
  let classifiedCount = 0;

  for (const point of points) {
    if (point.mineral) {
      classifiedCount++;
      modalComposition[point.mineral] = (modalComposition[point.mineral] || 0) + 1;
    }
  }

  return {
    totalPoints: points.length,
    classifiedCount,
    modalComposition,
  };
}

/**
 * Save a point count session to disk
 * @param {string} projectId - Project UUID
 * @param {Object} session - Complete session object
 * @returns {Promise<Object>} Result with success status
 */
async function saveSession(projectId, session) {
  console.log(`[PointCountStorage] Saving session ${session.id} for project ${projectId}`);

  try {
    // Ensure folder exists
    await ensurePointCountsFolder(projectId);

    // Update timestamp and recalculate summary
    const updatedSession = {
      ...session,
      updatedAt: new Date().toISOString(),
      summary: calculateSummary(session.points),
    };

    // Write to file
    const filePath = getSessionFilePath(projectId, session.id);
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(updatedSession, null, 2),
      'utf-8'
    );

    console.log(`[PointCountStorage] Successfully saved session to: ${filePath}`);

    return {
      success: true,
      session: updatedSession,
    };
  } catch (error) {
    console.error(`[PointCountStorage] Error saving session:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Load a point count session from disk
 * @param {string} projectId - Project UUID
 * @param {string} sessionId - Session UUID
 * @returns {Promise<Object>} Result with session or error
 */
async function loadSession(projectId, sessionId) {
  console.log(`[PointCountStorage] Loading session ${sessionId} for project ${projectId}`);

  try {
    const filePath = getSessionFilePath(projectId, sessionId);

    // Check if file exists
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
      console.log(`[PointCountStorage] Session not found: ${filePath}`);
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      };
    }

    // Read and parse file
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const session = JSON.parse(content);

    console.log(`[PointCountStorage] Successfully loaded session: ${session.name}`);

    return {
      success: true,
      session,
    };
  } catch (error) {
    console.error(`[PointCountStorage] Error loading session:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Delete a point count session from disk
 * @param {string} projectId - Project UUID
 * @param {string} sessionId - Session UUID
 * @returns {Promise<Object>} Result with success status
 */
async function deleteSession(projectId, sessionId) {
  console.log(`[PointCountStorage] Deleting session ${sessionId} from project ${projectId}`);

  try {
    const filePath = getSessionFilePath(projectId, sessionId);

    // Check if file exists
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
    } catch (error) {
      // File doesn't exist, consider it already deleted
      console.log(`[PointCountStorage] Session file not found (already deleted?): ${filePath}`);
      return {
        success: true,
        message: 'Session file not found',
      };
    }

    // Delete the file
    await fs.promises.unlink(filePath);

    console.log(`[PointCountStorage] Successfully deleted session: ${sessionId}`);

    return {
      success: true,
    };
  } catch (error) {
    console.error(`[PointCountStorage] Error deleting session:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * List all point count sessions for a micrograph
 * Returns lightweight summaries without full point data
 * @param {string} projectId - Project UUID
 * @param {string} micrographId - Micrograph UUID
 * @returns {Promise<Object>} Result with sessions array
 */
async function listSessions(projectId, micrographId) {
  console.log(`[PointCountStorage] Listing sessions for micrograph ${micrographId} in project ${projectId}`);

  try {
    const folderPath = getPointCountsFolder(projectId);

    // Check if folder exists
    try {
      await fs.promises.access(folderPath, fs.constants.F_OK);
    } catch (error) {
      // Folder doesn't exist, no sessions
      console.log(`[PointCountStorage] No point-counts folder found`);
      return {
        success: true,
        sessions: [],
      };
    }

    // Read all JSON files in folder
    const files = await fs.promises.readdir(folderPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const sessions = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(folderPath, file);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const session = JSON.parse(content);

        // Only include sessions for the specified micrograph
        if (session.micrographId === micrographId) {
          // Create lightweight summary (no points array)
          sessions.push({
            id: session.id,
            micrographId: session.micrographId,
            name: session.name,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            gridType: session.gridType,
            totalPoints: session.summary?.totalPoints || session.points?.length || 0,
            classifiedCount: session.summary?.classifiedCount || 0,
          });
        }
      } catch (error) {
        console.warn(`[PointCountStorage] Error reading session file ${file}:`, error.message);
        // Continue with other files
      }
    }

    // Sort by updatedAt (most recent first)
    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    console.log(`[PointCountStorage] Found ${sessions.length} session(s) for micrograph ${micrographId}`);

    return {
      success: true,
      sessions,
    };
  } catch (error) {
    console.error(`[PointCountStorage] Error listing sessions:`, error);
    return {
      success: false,
      error: error.message,
      sessions: [],
    };
  }
}

/**
 * List all point count sessions for all micrographs in a project
 * Useful for getting an overview of all point counting work
 * @param {string} projectId - Project UUID
 * @returns {Promise<Object>} Result with sessions array
 */
async function listAllSessions(projectId) {
  console.log(`[PointCountStorage] Listing all sessions for project ${projectId}`);

  try {
    const folderPath = getPointCountsFolder(projectId);

    // Check if folder exists
    try {
      await fs.promises.access(folderPath, fs.constants.F_OK);
    } catch (error) {
      // Folder doesn't exist, no sessions
      return {
        success: true,
        sessions: [],
      };
    }

    // Read all JSON files in folder
    const files = await fs.promises.readdir(folderPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const sessions = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(folderPath, file);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const session = JSON.parse(content);

        // Create lightweight summary (no points array)
        sessions.push({
          id: session.id,
          micrographId: session.micrographId,
          name: session.name,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          gridType: session.gridType,
          totalPoints: session.summary?.totalPoints || session.points?.length || 0,
          classifiedCount: session.summary?.classifiedCount || 0,
        });
      } catch (error) {
        console.warn(`[PointCountStorage] Error reading session file ${file}:`, error.message);
        // Continue with other files
      }
    }

    // Sort by updatedAt (most recent first)
    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    console.log(`[PointCountStorage] Found ${sessions.length} total session(s) for project ${projectId}`);

    return {
      success: true,
      sessions,
    };
  } catch (error) {
    console.error(`[PointCountStorage] Error listing all sessions:`, error);
    return {
      success: false,
      error: error.message,
      sessions: [],
    };
  }
}

/**
 * Rename a point count session
 * @param {string} projectId - Project UUID
 * @param {string} sessionId - Session UUID
 * @param {string} newName - New name for the session
 * @returns {Promise<Object>} Result with success status
 */
async function renameSession(projectId, sessionId, newName) {
  console.log(`[PointCountStorage] Renaming session ${sessionId} to "${newName}"`);

  try {
    // Load existing session
    const loadResult = await loadSession(projectId, sessionId);
    if (!loadResult.success) {
      return loadResult;
    }

    // Update name
    const updatedSession = {
      ...loadResult.session,
      name: newName,
    };

    // Save back
    return await saveSession(projectId, updatedSession);
  } catch (error) {
    console.error(`[PointCountStorage] Error renaming session:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  getPointCountsFolder,
  getSessionFilePath,
  ensurePointCountsFolder,
  saveSession,
  loadSession,
  deleteSession,
  listSessions,
  listAllSessions,
  renameSession,
};
