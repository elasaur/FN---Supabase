// static/js/config.js

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

const DEFAULT_FOLDER_ICON = 'https://img.icons8.com/pulsar-color/48/bookmark.png';

const SYSTEM_FOLDER_ICONS = [
  { value:'https://img.icons8.com/pulsar-color/48/hearts.png', label:'Hearts' },
  { value:'https://img.icons8.com/pulsar-color/48/flower.png', label:'Flower' },
  { value:'https://img.icons8.com/pulsar-color/48/star.png', label:'Star' },
  { value:'https://img.icons8.com/pulsar-color/48/goal.png', label:'Goal' },
  { value:'https://img.icons8.com/pulsar-color/48/backpack.png', label:'Backpack' },
  { value:'https://img.icons8.com/pulsar-color/48/shopaholic.png', label:'Shopping' },
  { value:'https://img.icons8.com/pulsar-color/48/tag.png', label:'Tag' },
  { value:'https://img.icons8.com/pulsar-color/48/read.png', label:'Read' },
  { value:'https://img.icons8.com/pulsar-color/48/book.png', label:'Book' },
  { value:'https://img.icons8.com/pulsar-color/48/trave-diary.png', label:'Travel Diary' },
  { value:'https://img.icons8.com/pulsar-color/48/code.png', label:'Code' },
  { value:'https://img.icons8.com/pulsar-color/48/leaf.png', label:'Leaf' },
  { value:'https://img.icons8.com/pulsar-color/48/acid-flask.png', label:'Science' },
  { value:'https://img.icons8.com/pulsar-color/48/black-cat.png', label:'Cat' },
  { value:'https://img.icons8.com/pulsar-color/48/year-of-dog.png', label:'Dog' },
  { value:'https://img.icons8.com/pulsar-color/48/test-passed.png', label:'Done' },
  { value:'https://img.icons8.com/pulsar-color/48/my-computer.png', label:'Computer' },
  { value:'https://img.icons8.com/pulsar-color/48/graduation-cap.png', label:'School' },
  { value:'https://img.icons8.com/pulsar-color/48/salmon-sushi.png', label:'Food' },
  { value:'https://img.icons8.com/pulsar-color/48/birthday-cake.png', label:'Birthday' },
  { value:'https://img.icons8.com/pulsar-color/48/business.png', label:'Business' },
  { value:'https://img.icons8.com/pulsar-color/48/globe.png', label:'Globe' },
  { value:'https://img.icons8.com/pulsar-color/48/moleskine.png', label:'Notes' },
  { value:DEFAULT_FOLDER_ICON, label:'Bookmark' },
];

const pageTitles = {
  dashboard:'Dashboard',
  upload:'Upload Files',
  folders:'All Folders',
  files:'All Files',
  stats:'Statistics',
  settings:'Settings',
};
