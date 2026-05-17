// static/js/config.js

function iconPackPath(file) {
  const iconName = String(file).split('/').pop();
  return `/icons-pack/${encodeURIComponent(iconName)}`;
}

const EXT_ICONS = {
  pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊',
  ppt:'📊', pptx:'📊', jpg:'🖼️', jpeg:'🖼️', png:'🖼️',
  gif:'🖼️', mp3:'🎵', mp4:'🎬', wav:'🎵', txt:'📃',
  zip:'🗜️', rar:'🗜️', csv:'📊',
};

const COLOR_OPTIONS = [
  { val:'#e8855a', bg:'#fde8de' },
  { val:'#7ecfb3', bg:'#d9f5ec' },
  { val:'#9b87d4', bg:'#ede8f8' },
  { val:'#7ec8e3', bg:'#e0f4fb' },
  { val:'#f5a7c7', bg:'#fce8f3' },
  { val:'#e8b84b', bg:'#fef7dd' },
  { val:'#e87a7a', bg:'#fde8e8' },
  { val:'#52b788', bg:'#d8f3e8' },
  { val:'#6c757d', bg:'#f0f0f0' },
  { val:'#c77dff', bg:'#f3e8ff' },
];

const FOLDER_EMOJIS = [
  '📁','📂','📚','📖','📝','📋','📊','📈','💼','🗂️',
  '🗃️','🗄️','📌','📎','✏️','💰','💳','🧾','🏥','⚖️',
  '🔬','🧬','💻','🖥️','📸','🎵','🎬','🎨','🏠','✈️',
  '🚗','🍽️','💪','🐾','🎓','🏆','🔑','🛡️','⭐','🌿',
];

const DEFAULT_FOLDER_ICON = iconPackPath('icons8-folder-50.png');

const SYSTEM_FOLDER_ICONS = [
  { value:iconPackPath('icons8-folder-50.png'), label:'Folder' },
  { value:iconPackPath('icons8-document-50.png'), label:'Document' },
  { value:iconPackPath('icons8-bar-chart-50.png'), label:'Chart' },
  { value:iconPackPath('icons8-spreadsheet-file-48.png'), label:'Spreadsheet' },
  { value:iconPackPath('icons8-image-48.png'), label:'Image' },
  { value:iconPackPath('icons8-audio-file-48.png'), label:'Audio' },
  { value:iconPackPath('icons8-video-file-48.png'), label:'Video' },
  { value:iconPackPath('icons8-archive-folder-48.png'), label:'Archive' },
  { value:iconPackPath('icons8-database-50.png'), label:'Database' },
  { value:iconPackPath('icons8-cyber-security-50.png'), label:'Security' },
  { value:iconPackPath('icons8-rocket-50.png'), label:'Rocket' },
  { value:iconPackPath('icons8-profile-48.png'), label:'Profile' },
  { value:DEFAULT_FOLDER_ICON, label:'Bookmark' },
];

const pageTitles = {
  dashboard:'Home',
  upload:'Upload Files',
  folders:'All Folders',
  files:'All Files',
  stats:'Statistics',
  features:'Features',
  instructions:'Instructions',
  about:'About the System',
  settings:'Settings',
};
