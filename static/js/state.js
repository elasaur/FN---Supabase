let currentFile = null;
let currentAnalysis = null;
let selectedFolderObj = null;

let allFolders = [];
let allFiles = [];
let uploadFiles = [];
let allFilesLoaded = false;

let folderSortMode = 'name';
let allFilesSortMode = 'name';
let uploadSortMode = 'date';
let dashRecentSortMode = 'date';
let dashRecentFiles = [];
let folderFilesSortMode = 'name';
let currentFolderFilesContext = null;
let folderNoteDirty = false;
let fileToMoveId = null;
let fileToRenameId = null;
let fileToDeleteId = null;

let aiEnabled = localStorage.getItem('aiEnabled') !== 'false';
