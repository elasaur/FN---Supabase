let currentFile = null;
let currentAnalysis = null;
let selectedFolderObj = null;

let allFolders = [];
let allFiles = [];
let uploadFiles = [];

let folderSortMode = 'name';
let allFilesSortMode = 'name';
let uploadSortMode = 'date';
let dashRecentSortMode = 'date';
let dashRecentFiles = [];
let folderFilesSortMode = 'name';
let currentFolderFilesContext = null;
let fileToMoveId = null;
let fileToRenameId = null;

let pickedColor = COLOR_OPTIONS[0];
let pickedEmoji = '📁';
let cfPickedColor = COLOR_OPTIONS[0];
let cfModalColor = COLOR_OPTIONS[0];

let aiEnabled = localStorage.getItem('aiEnabled') !== 'false';
