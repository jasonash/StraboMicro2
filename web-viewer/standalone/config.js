// StraboMicro Web Viewer configuration.
// Edit the values below; every option is optional.
window.StraboMicroViewerConfig = {
  // Folder that holds the decompressed .smz project folders, one folder per
  // project, named by the project id. Relative to view.html, or a full URL.
  // A folder on another site works only if that site allows it (CORS).
  smzFilesLocation: './smzFiles/',

  // Show the StraboMicro logo and name at the left of the top bar.
  showHeader: true,

  // Show the "exported from StraboMicro" line under the viewer.
  showFooter: true,

  // Show a PDF button when the project folder has a project.pdf.
  showPdfLink: true,

  // Address of the .smz file for the SMZ button; {id} is replaced by the
  // project id. Leave empty for no button.
  // Example: './smzDownloads/{id}.smz'
  smzDownloadUrl: '',

  // Address for the Share button; {id} is replaced by the project id.
  // Leave empty for no button.
  // Example: 'https://example.org/microviewer/view.html?p={id}'
  shareUrl: '',

  // Layout: 'auto' (compact when the viewer is narrower than 1000 px, for
  // example in an iframe), 'full' (three panes) or 'compact'.
  // A link can choose too: view.html?p=<id>&layout=compact
  layout: 'auto',

  // Colors: 'dark' or 'light' (for pages with a white background).
  // A link can choose too: view.html?p=<id>&theme=light
  theme: 'dark',
};
