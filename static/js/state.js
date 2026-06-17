let currentFile = null;
let currentAnalysis = null;
let selectedFolderObj = null;

let allFolders = [];
let allFiles = [];
let uploadFiles = [];
let allFilesLoaded = false;

let folderSortMode = 'name-asc';
let allFilesSortMode = 'name-asc';
let uploadSortMode = 'date-desc';
let dashRecentSortMode = 'date-desc';
let dashRecentFiles = [];
let folderFilesSortMode = 'name-asc';
let allFilesTypeFilter = 'all';
let uploadTypeFilter = 'all';
let dashRecentTypeFilter = 'all';
let folderFilesTypeFilter = 'all';
let currentFolderFilesContext = null;
let folderNoteDirty = false;
let fileToMoveId = null;
let fileToRenameId = null;
let fileToDeleteId = null;

function readLocalStorage(key, fallback = null) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return fallback;
  }
}

function writeLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {}
}

function removeLocalStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (_) {}
}

let aiEnabled = readLocalStorage('aiEnabled') !== 'false';
