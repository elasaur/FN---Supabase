function getNoteEditor(editorEl) {
  const editor = editorEl || document.getElementById('folderNoteEditor');
  if (editor && !editor.dataset.bound) {
    editor.dataset.bound = '1';
    editor.addEventListener('keydown', handleNoteEditorKeydown);
    editor.addEventListener('input', handleNoteEditorInput);
    editor.addEventListener('paste', handleNoteEditorPaste);
    editor.addEventListener('change', handleNoteEditorChange);
  }
  return editor;
}

function setNoteEditorBody(body, editorEl) {
  const editor = getNoteEditor(editorEl);
  if (!editor) return;
  editor.innerHTML = '';
  const lines = String(body || '').split(/\r?\n/);
  if (!lines.length) lines.push('');
  lines.forEach(line => appendNoteEditorLine(editor, line));
  if (!editor.children.length) appendTextEditorLine(editor, '');
}

function setFolderNoteDirty() {
  if (typeof folderNoteDirty !== 'undefined') folderNoteDirty = true;
  if (typeof updateFolderNoteActions === 'function') updateFolderNoteActions();
}

function appendNoteEditorLine(editor, rawLine) {
  const line = String(rawLine || '');
  const trimmed = line.trimStart();
  if (/^\[[xX]\]\s*/.test(trimmed)) {
    appendChecklistEditorLine(editor, trimmed.replace(/^\[[xX]\]\s*/, ''), true);
  } else if (/^(\[\]|\[ \])\s*/.test(trimmed)) {
    appendChecklistEditorLine(editor, trimmed.replace(/^(\[\]|\[ \])\s*/, ''), false);
  } else if (/^[-*]\s+/.test(trimmed)) {
    appendBulletEditorLine(editor, trimmed.replace(/^[-*]\s+/, ''));
  } else {
    appendTextEditorLine(editor, line);
  }
}

function appendTextEditorLine(editor, text, afterLine) {
  const line = document.createElement('div');
  line.className = 'note-editor-line note-text-line';
  line.dataset.type = 'text';
  const span = createNoteEditable(text, editor.children.length ? '' : 'Text here...');
  line.appendChild(span);
  insertEditorLine(editor, line, afterLine);
  return line;
}

function appendChecklistEditorLine(editor, text, checked, afterLine) {
  const line = document.createElement('div');
  line.className = `note-editor-line note-check-line${checked ? ' checked' : ''}`;
  line.dataset.type = 'check';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(checked);
  const span = createNoteEditable(text);
  span.classList.add('note-check-text');
  line.append(checkbox, span);
  insertEditorLine(editor, line, afterLine);
  return line;
}

function appendBulletEditorLine(editor, text, afterLine) {
  const line = document.createElement('div');
  line.className = 'note-editor-line note-bullet-line';
  line.dataset.type = 'bullet';
  const marker = document.createElement('span');
  marker.className = 'note-bullet-marker';
  marker.textContent = '\u2022';
  line.append(marker, createNoteEditable(text));
  insertEditorLine(editor, line, afterLine);
  return line;
}

function createNoteEditable(text, placeholder) {
  const span = document.createElement('span');
  span.className = 'note-editable';
  span.contentEditable = 'true';
  span.setAttribute('role', 'textbox');
  span.spellcheck = true;
  span.dataset.placeholder = placeholder || '';
  setEditableMarkdown(span, text || '');
  return span;
}

function insertEditorLine(editor, line, afterLine) {
  if (afterLine?.nextSibling) {
    editor.insertBefore(line, afterLine.nextSibling);
  } else {
    editor.appendChild(line);
  }
}

function setEditableMarkdown(editable, value) {
  editable.innerHTML = '';
  const text = String(value || '');
  const boldPattern = /\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/g;
  let cursor = 0;
  let match;
  while ((match = boldPattern.exec(text))) {
    if (match.index > cursor) {
      editable.appendChild(document.createTextNode(text.slice(cursor, match.index)));
    }
    const strong = document.createElement('strong');
    strong.textContent = match[1];
    editable.appendChild(strong);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    editable.appendChild(document.createTextNode(text.slice(cursor)));
  }
}

function serializeEditableMarkdown(editable) {
  if (!editable) return '';
  const serializeNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const childText = [...node.childNodes].map(serializeNode).join('');
    const fontWeight = node.style?.fontWeight || '';
    const isBold = tag === 'b'
      || tag === 'strong'
      || fontWeight === 'bold'
      || Number(fontWeight) >= 600;
    return isBold && childText ? `**${childText}**` : childText;
  };
  return [...editable.childNodes].map(serializeNode).join('');
}

function handleNoteEditorKeydown(e) {
  const editable = e.target.closest?.('.note-editable');
  if (!editable) return;
  const line = editable.closest('.note-editor-line');
  const editor = line?.closest('.note-body-editor') || getNoteEditor();
  if (!line || !editor) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    setFolderNoteDirty();
    const isEmptyListItem = (line.dataset.type === 'check' || line.dataset.type === 'bullet')
      && editable.textContent.trim() === '';
    if (isEmptyListItem) {
      const next = appendTextEditorLine(editor, '', line);
      line.remove();
      focusEditable(next);
      return;
    }
    const next = line.dataset.type === 'check'
      ? appendChecklistEditorLine(editor, '', false, line)
      : line.dataset.type === 'bullet'
        ? appendBulletEditorLine(editor, '', line)
        : appendTextEditorLine(editor, '', line);
    focusEditable(next);
  }

  if (e.key === 'Backspace' && editable.textContent === '' && editor.children.length > 1) {
    e.preventDefault();
    setFolderNoteDirty();
    const previous = line.previousElementSibling || line.nextElementSibling;
    line.remove();
    focusEditable(previous);
  }
}

function handleNoteEditorInput(e) {
  const editable = e.target.closest?.('.note-editable');
  if (!editable) return;
  setFolderNoteDirty();
  const line = editable.closest('.note-editor-line');
  const editor = line?.closest('.note-body-editor') || getNoteEditor();
  if (!line || !editor || line.dataset.type !== 'text') return;
  const trimmed = editable.textContent || '';

  if (/^(\[[xX]\]|\[\]|\[ \])(\s+.*)?$/.test(trimmed.trimStart())) {
    const markerText = trimmed.trimStart();
    const checked = /^\[[xX]\]/.test(markerText);
    const nextText = markerText.replace(/^(\[[xX]\]|\[\]|\[ \])\s*/, '');
    const next = appendChecklistEditorLine(editor, nextText, checked, line);
    line.remove();
    focusEditable(next);
  } else if (/^[-*]\s+/.test(trimmed.trimStart())) {
    const nextText = trimmed.trimStart().replace(/^[-*]\s+/, '');
    const next = appendBulletEditorLine(editor, nextText, line);
    line.remove();
    focusEditable(next);
  }
}

function handleNoteEditorPaste(e) {
  const editable = e.target.closest?.('.note-editable');
  if (!editable) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) {
    document.execCommand('insertText', false, text);
    setFolderNoteDirty();
    return;
  }

  const line = editable.closest('.note-editor-line');
  const editor = line?.closest('.note-body-editor') || getNoteEditor();
  if (!line || !editor) return;
  editable.textContent = lines.shift() || '';
  let afterLine = line;
  lines.forEach(rawLine => {
    appendNoteEditorLineAfter(editor, rawLine, afterLine);
    afterLine = afterLine.nextElementSibling || afterLine;
  });
  focusEditable(afterLine);
  setFolderNoteDirty();
}

function handleNoteEditorChange(e) {
  if (!e.target.matches('input[type="checkbox"]')) return;
  const line = e.target.closest('.note-check-line');
  if (!line) return;
  line.classList.toggle('checked', e.target.checked);
  setFolderNoteDirty();
}

function appendNoteEditorLineAfter(editor, rawLine, afterLine) {
  const beforeCount = editor.children.length;
  appendNoteEditorLine(editor, rawLine);
  const line = editor.children[editor.children.length - 1];
  if (!line || editor.children.length === beforeCount) return null;
  if (afterLine?.nextSibling) {
    editor.insertBefore(line, afterLine.nextSibling);
  }
  return line;
}

function getActiveNoteLine(editor) {
  const activeLine = document.activeElement?.closest?.('.note-editor-line');
  if (activeLine && editor.contains(activeLine)) return activeLine;
  return editor.querySelector('.note-editor-line') || appendTextEditorLine(editor, '');
}

function toggleNoteLineType(type) {
  const editor = getNoteEditor();
  if (!editor) return;
  const line = getActiveNoteLine(editor);
  const currentType = line?.dataset?.type || 'text';
  const text = serializeEditableMarkdown(line?.querySelector('.note-editable'));
  let nextLine;

  if (type === 'bullet' && currentType !== 'bullet') {
    nextLine = appendBulletEditorLine(editor, text, line);
  } else if (type === 'check' && currentType !== 'check') {
    nextLine = appendChecklistEditorLine(editor, text, false, line);
  } else {
    nextLine = appendTextEditorLine(editor, text, line);
  }

  line?.remove();
  focusEditable(nextLine);
  setFolderNoteDirty();
}

function focusEditable(line) {
  const editable = line?.querySelector?.('.note-editable');
  if (!editable) return;
  editable.focus();
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function serializeNoteEditorBody(editorEl) {
  const editor = getNoteEditor(editorEl);
  if (!editor) return '';
  return [...editor.querySelectorAll('.note-editor-line')]
    .map(line => {
      const text = serializeEditableMarkdown(line.querySelector('.note-editable'));
      if (line.dataset.type === 'check') {
        const checked = line.querySelector('input[type="checkbox"]')?.checked;
        return `${checked ? '[x]' : '[]'} ${text}`.trimEnd();
      }
      if (line.dataset.type === 'bullet') {
        return `- ${text}`.trimEnd();
      }
      return text;
    })
    .join('\n')
    .replace(/\n+$/g, '');
}
