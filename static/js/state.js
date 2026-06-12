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
