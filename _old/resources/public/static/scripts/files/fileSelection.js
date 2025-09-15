'use strict';

/** @type { string[] } */
const currentFileSelection = [];

document.getElementById('file-list')
  .addEventListener('click', (event) => {
    const fileInfoElement = findFileInfoElement(event);
    if (fileInfoElement == null) {
      return;
    }

    event.preventDefault();

    const fileInfo = parseFileInfo(fileInfoElement);
    const ctrlPressed = event.ctrlKey || event.metaKey;

    if (ctrlPressed) {
      toggleFileSelection(fileInfo, fileInfoElement);
    } else if (isFileSelectedExclusively(fileInfo)) {
      location.href = fileInfo.frontendUrl; // TODO: Check for double click
    } else {
      clearFileSelection();
      toggleFileSelection(fileInfo, fileInfoElement);
    }

    updateMultiFileSelectionStatusCard();

    console.log('fileInfo:', fileInfo);
  });

function updateMultiFileSelectionStatusCard() {
  const statusCardElement = document.getElementById('multi-file-selection-status');

  if (currentFileSelection.length <= 1) {
    statusCardElement.parentElement.classList.add('d-none');
  } else {
    statusCardElement.parentElement.classList.remove('d-none');
  }

  statusCardElement.querySelector('.card-text').innerText = `${currentFileSelection.length} Einträge ausgewählt`;
}

function isFileSelectedExclusively(fileInfo) {
  return currentFileSelection.length === 1 && isFileSelected(fileInfo);
}

function isFileSelected(fileInfo) {
  return currentFileSelection.includes(fileInfo.frontendUrl);
}

function clearFileSelection() {
  for (const selectionFrontendUrl of currentFileSelection) {
    const fileInfoElement = findFileInfoElementByFrontendUrl(selectionFrontendUrl);

    fileInfoElement.classList.remove('selected');
  }

  currentFileSelection.length = 0;
}

/**
 * @param {object} fileInfo
 * @param {HTMLElement} fileInfoElement
 */
function toggleFileSelection(fileInfo, fileInfoElement) {
  if (currentFileSelection.includes(fileInfo.frontendUrl)) {
    currentFileSelection.splice(currentFileSelection.indexOf(fileInfo.frontendUrl), 1);
    fileInfoElement.classList.remove('selected');
  } else {
    currentFileSelection.push(fileInfo.frontendUrl);
    fileInfoElement.classList.add('selected');
  }
}

// FIXME: Cache parsed file info? Or at least create a mapping for frontendUrl -> fileInfoElement
/**
 * @param { HTMLElement } element
 * @return { object }
 */
function parseFileInfo(element) {
  const fileItemValue = element.dataset.fileItem;

  if (fileItemValue == null || fileItemValue === '') {
    throw new Error('Invalid file info element');
  }

  return JSON.parse(decodeURI(fileItemValue));
}

/**
 * @param { MouseEvent } event
 * @return { HTMLElement | null }
 */
function findFileInfoElement(event) {
  let target = event.target;
  while (event.currentTarget.contains(target) && !target.classList.contains('file-list-item')) {
    target = target.parentElement;
  }

  if (!target.classList.contains('file-list-item')) {
    return null;
  }

  return target;
}

/**
 * @param {string} frontendUrl
 * @return { HTMLElement | null }
 */
function findFileInfoElementByFrontendUrl(frontendUrl) {
  const fileInfoElements = document.getElementsByClassName('file-list-item');

  for (const fileInfoElement of fileInfoElements) {
    const fileInfo = parseFileInfo(fileInfoElement);

    if (fileInfo.frontendUrl === frontendUrl) {
      return fileInfoElement;
    }
  }

  return null;
}
