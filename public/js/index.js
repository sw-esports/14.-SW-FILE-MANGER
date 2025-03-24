document.addEventListener('DOMContentLoaded', () => {
  // Initialize Socket.IO
  const socket = io();
  let currentPath = '';
  let selectedItems = [];
  let clipboard = { items: [], operation: '' };

  // Add these variables at the top of your script
  let currentSortField = 'name'; // Default sort field
  let currentSortDirection = 'asc'; // Default sort direction

  // DOM elements
  const mainSection = document.querySelector('.mainSection');
  const pathContainer = document.querySelector('.currentPathContainer');
  const backButton = document.querySelector('.ri-arrow-left-line');
  const upButton = document.querySelector('.ri-arrow-up-line');
  const refreshButton = document.querySelector('.refresh');
  const searchInput = document.querySelector('.searchBox input');
  const newButton = document.querySelector('.newCreate');
  const deleteButton = document.querySelector('.ri-delete-bin-line');
  
  // Add clipboard button references
  const copyButton = document.querySelector('.ri-file-copy-line');
  const cutButton = document.querySelector('.ri-scissors-2-fill');
  const pasteButton = document.querySelector('.ri-clipboard-line');

  // Add a forward navigation function and bind it
  const forwardButton = document.querySelector('.ri-arrow-right-line');
  if (forwardButton) {
    forwardButton.addEventListener('click', navigateForward);
  }

  // Find the sort button
  const sortButton = document.querySelector('.sort-btn');
  if (sortButton) {
    sortButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSortDialog(e);
    });
  }

  // Handle sidebar navigation
  document.querySelectorAll('.sideBar a').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      console.log("Click on sidebar");
      
      // Get the path from the href attribute
      const href = link.getAttribute('href');
      
      // Fetch the correct special folder path from server
      const specialFolder = href.replace('/', '');
      try {
        const response = await fetch(`/special-folder/${specialFolder}`);
        
        if (!response.ok) {
          throw new Error(`Failed to get path for ${specialFolder}`);
        }
        
        const data = await response.json();
        
        // Update current path and load directory
        if (data.path) {
          loadCurrentDirectory(data.path);
        }
      } catch (error) {
        console.error('Error navigating to folder:', error);
      }
    });
  });

  // Track navigation history
  let navigationHistory = [];
  let navigationForwardHistory = [];

  // Add path module for client side with basename function
  const pathModule = {
    dirname: function(path) {
      // Simple implementation for client-side use
      return path.replace(/\\/g, '/').replace(/\/[^\/]*$/, '');
    },
    join: function(dir, file) {
      // Simple implementation for client-side use
      if (dir.endsWith('/') || dir.endsWith('\\')) {
        return dir + file;
      }
      return dir + '/' + file;
    },
    basename: function(path) {
      // Extract the file name from a path
      const parts = path.replace(/\\/g, '/').split('/');
      return parts[parts.length - 1];
    }
  };

  // Socket events
  socket.on('update', (data) => {
    console.log('Received update:', data);
    loadCurrentDirectory(currentPath);
  });

  // Initial load - fetch user's home directory
  loadCurrentDirectory();

  // Load available drives
  loadDrives();

  // Event listeners
  backButton.addEventListener('click', navigateBack);
  upButton.addEventListener('click', navigateUp);
  
  if (refreshButton) {
    refreshButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Add a small rotation animation for visual feedback
      // Refresh the current directory
      loadCurrentDirectory(currentPath);
    });
  }
  
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      searchFiles(searchInput.value);
    }
  });
  
  pathContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadCurrentDirectory(pathContainer.textContent.trim());
    }
  });

  if (newButton) {
    newButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showCreateDialog();
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener('click', () => {
      if (selectedItems.length > 0) {
        deleteSelectedItems();
      } else {
        alert('Please select files or folders to delete');
      }
    });
  }

  // Add clipboard button event listeners
  if (copyButton) {
    copyButton.addEventListener('click', () => {
      if (selectedItems.length > 0) {
        clipboard.items = [...selectedItems];
        clipboard.operation = 'copy';
        console.log('Items copied to clipboard:', clipboard.items);
        showNotification('Items copied to clipboard');
      } else {
        alert('Please select files or folders to copy');
      }
    });
  }
  
  if (cutButton) {
    cutButton.addEventListener('click', () => {
      if (selectedItems.length > 0) {
        clipboard.items = [...selectedItems];
        clipboard.operation = 'cut';
        console.log('Items cut to clipboard:', clipboard.items);
        
        // Show visual feedback
        document.querySelectorAll('.folderCard.selected').forEach(card => {
          card.style.opacity = '0.6';
        });
      } else {
        alert('Please select files or folders to cut');
      }
    });
  }
  
  if (pasteButton) {
    pasteButton.addEventListener('click', () => {
      if (clipboard.items.length > 0) {
        pasteItems();
      } else {
        alert('Clipboard is empty');
      }
    });
  }

  // Add view toggle functionality
  const viewButton = document.querySelector('.ri-gallery-view-2').parentElement;
  if (viewButton) {
    viewButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showViewDialog(e);
    });
  }

  // Functions
  async function loadCurrentDirectory(path = '') {
    try {
      // Format the path properly for API request
      let formattedPath = path;
      
      // Special handling for drive roots on Windows
      if (/^[A-Z]:[\\/]?$/i.test(path)) {
        // Make sure the drive letter has a trailing backslash
        formattedPath = path.endsWith('\\') ? path : path + '\\';
      }
      
      console.log(`Loading directory: ${formattedPath}`);
      
      const response = await fetch(`/files?path=${encodeURIComponent(formattedPath)}`);
      
      // Check if the response is OK
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load directory: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Verify we have valid data
      if (!data || !Array.isArray(data.items)) {
        throw new Error('Invalid response format from server');
      }
      
      // Only add to history if we're changing paths and have a current path
      if (currentPath && currentPath !== data.currentPath) {
        navigationHistory.push(currentPath);
        // Clear forward history since we're taking a new path
        navigationForwardHistory = [];
      }
      
      currentPath = data.currentPath;
      pathContainer.textContent = currentPath;
      
      // Clear and populate the main section
      mainSection.innerHTML = '';
      
      data.items.forEach(item => {
        const card = createFileCard(item);
        mainSection.appendChild(card);
      });
      
      // Update file count or any status info if you have such an element
      updateFileCountStatus(data.items.length);
      
      // Apply the current sort if specified
      if (currentSortField && currentSortDirection) {
        sortAndDisplayItems();
      }
      
      // Apply the saved view mode
      initializeViewMode();
    } catch (error) {
      console.error('Error loading directory:', error);
      showNotification('Error loading directory: ' + error.message, 3000);
      
      // Show an empty folder message in the main section
      mainSection.innerHTML = `
        <div style="text-align: center; padding: 50px; color: var(--textColor); opacity: 0.6;">
          <i class="ri-folder-open-line" style="font-size: 48px; margin-bottom: 10px;"></i>
          <p>Unable to access this location</p>
          <p style="font-size: 0.9em;">${error.message}</p>
        </div>
      `;
    }
  }

  // Function to load and display available drives in the sidebar
  async function loadDrives() {
    try {
      const response = await fetch('/drives');
      const data = await response.json();
      
      if (data.drives && data.drives.length > 0) {
        // Find the sidebar ul element
        const sidebarUl = document.querySelector('.sideBar ul');
        
        if (!sidebarUl) {
          console.error("Sidebar ul not found");
          return;
        }
        
        // Remove any existing drive elements (those after the separator)
        const separator = document.querySelector('.drives-separator');
        if (separator) {
          let nextElement = separator.nextElementSibling;
          while (nextElement) {
            const elementToRemove = nextElement;
            nextElement = nextElement.nextElementSibling;
            sidebarUl.removeChild(elementToRemove);
          }
        }
        
        // Add each drive to the sidebar
        data.drives.forEach(drive => {
          // Drive name (remove colon from display if it exists)
          const driveName = drive.endsWith(':') ? drive : `${drive}:`;
          
          // Determine if drive is likely a USB drive (non C: drive on Windows)
          const isLikelyUsb = /^[^C]:$/i.test(driveName);
          
          // Create a link element in the same format as other sidebar items
          const driveItem = document.createElement('a');
          driveItem.href = "#"; // We'll handle navigation with JavaScript
          driveItem.setAttribute('data-drive', drive);
          driveItem.classList.add('drive');
          
          driveItem.innerHTML = `
            <li>
              <img src="/src/images/${isLikelyUsb ? 'usb-icon.png' : 'drive-icon.png'}" alt="" />
              ${driveName} Drive
            </li>
          `;
          
          // Add click event for drives
          driveItem.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Format the drive path for the OS
            let drivePath = driveName;
            if (!drivePath.endsWith('\\')) {
              drivePath += '\\';
            }
            
            try {
              console.log(`Navigating to drive: ${drivePath}`);
              await loadCurrentDirectory(drivePath);
              
              // Highlight the selected drive
              document.querySelectorAll('.sideBar a').forEach(a => {
                a.classList.remove('active');
              });
              driveItem.classList.add('active');
            } catch (error) {
              console.error(`Error accessing drive ${drivePath}:`, error);
              showNotification(`Cannot access drive ${driveName}. You may not have permission.`, 3000);
            }
          });
          
          // Append drive item directly to the ul element
          sidebarUl.appendChild(driveItem);
        });
        
        console.log(`Displayed ${data.drives.length} drives in sidebar`);
      }
    } catch (error) {
      console.error('Error loading drives:', error);
    }
  }

  function createFileCard(item) {
    const card = document.createElement('div');
    card.className = 'folderCard';
    card.dataset.path = item.path;
    card.dataset.isDirectory = item.isDirectory;
    
    // Add size and modified date as data attributes for sorting
    if (item.size !== undefined) {
      card.dataset.size = item.size;
    }
    if (item.modified !== undefined) {
      card.dataset.modified = item.modified;
    }
    
    let iconSrc = '/src/images/folder-icon.jpg';
    if (!item.isDirectory) {
      // Determine icon based on file extension
      const ext = item.name.split('.').pop().toLowerCase();
      if (ext === 'txt') iconSrc = '/src/images/txt-icon.png';
      else if (['doc', 'docx'].includes(ext)) iconSrc = '/src/images/word-icon.png';
      else if (['xls', 'xlsx'].includes(ext)) iconSrc = '/src/images/excel-icon.png';
      else if (['ppt', 'pptx'].includes(ext)) iconSrc = '/src/images/powerpoint-icon.png';
      // Use the thumbnail endpoint for images
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
        iconSrc = `/thumbnail?path=${encodeURIComponent(item.path)}`;
      }
      else if (['mp3', 'wav'].includes(ext)) iconSrc = '/src/images/music-icon.png';
      else if (['mp4', 'avi', 'mov'].includes(ext)) iconSrc = '/src/images/video-icon.png';
      else iconSrc = '/src/images/txt-icon.png'; // Default file icon
    }
    
    card.innerHTML = `
      <div class="folderIconContainer">
        <img src="${iconSrc}" alt="${item.isDirectory ? 'Folder' : 'File'} Icon">
      </div>
      <div class="folderName"></div>
      <span contenteditable="false" style="font-size: small;">${item.name}</span>
    `;
    
    // MODIFIED: Single click for selection only
    card.addEventListener('click', (e) => {
      // Prevent bubbling if clicking inside a contenteditable element
      if (e.target.isContentEditable) return;
      
      // Handle selection
      if (!e.ctrlKey) {
        // Clear all selected items if Ctrl is not pressed
        document.querySelectorAll('.folderCard.selected').forEach(card => {
          card.classList.remove('selected');
        });
        selectedItems = [];
      }
      
      // Toggle selection state
      card.classList.toggle('selected');
      
      if (card.classList.contains('selected')) {
        selectedItems.push(item.path);
      } else {
        selectedItems = selectedItems.filter(path => path !== item.path);
      }
      
      console.log('Selected items:', selectedItems);
    });
    
    // ADDED: Double click for opening files/folders
    card.addEventListener('dblclick', (e) => {
      // Prevent default actions
      e.preventDefault();
      
      // Prevent action if clicking in editable element
      if (e.target.isContentEditable) return;
      
      // Open folder or file on double click
      if (item.isDirectory) {
        loadCurrentDirectory(item.path);
      } else {
        // For files, try to open them
        window.open(`/open?path=${encodeURIComponent(item.path)}`, '_blank');
      }
    });
    
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, item);
    });
    
    // Separate event for renaming - specifically target the span
    const nameSpan = card.querySelector('span');
    nameSpan.addEventListener('dblclick', (e) => {
      // Stop propagation to prevent opening the file/folder
      e.stopPropagation();
      
      // Enable editing for rename
      e.target.contentEditable = true;
      e.target.focus();
      
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(e.target);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      e.target.addEventListener('keydown', async (evt) => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          const newName = e.target.textContent.trim();
          if (newName !== item.name) {
            // Fix: Use the client-side pathModule
            const newPath = pathModule.join(pathModule.dirname(item.path), newName);
            await renameItem(item.path, newPath);
          }
          e.target.contentEditable = false;
        }
      }, { once: true });
      
      e.target.addEventListener('blur', () => {
        e.target.contentEditable = false;
        e.target.textContent = item.name; // Reset if canceled
      }, { once: true });
    });
    
    return card;
  }

  function navigateBack() {
    if (navigationHistory.length > 0) {
      // Get previous path
      const previousPath = navigationHistory.pop();
      
      // Add current path to forward history
      navigationForwardHistory.push(currentPath);
      
      // Load without adding to history
      loadDirectoryWithoutHistory(previousPath);
    }
  }

  function navigateUp() {
    if (currentPath) {
      // Calculate parent path
      const parentPath = pathModule.dirname(currentPath);
      
      // Only navigate if parent is different (prevent root directory loops)
      if (parentPath !== currentPath) {
        // Standard navigation - will add to history
        loadCurrentDirectory(parentPath);
      }
    }
  }

  function navigateForward() {
    if (navigationForwardHistory.length > 0) {
      // Get next path
      const nextPath = navigationForwardHistory.pop();
      
      // Add current path to back history
      navigationHistory.push(currentPath);
      
      // Load without adding to history
      loadDirectoryWithoutHistory(nextPath);
    }
  }

  function searchFiles(query) {
    // Implement file search within current directory
    // This is a simple client-side filter
    if (!query) {
      loadCurrentDirectory(currentPath);
      return;
    }
    
    const fileCards = document.querySelectorAll('.folderCard');
    fileCards.forEach(card => {
      const name = card.querySelector('span').textContent.toLowerCase();
      if (name.includes(query.toLowerCase())) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  async function createNewItem(type, name) {
    try {
      const response = await fetch('/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type, 
          path: currentPath,
          name
        })
      });
      
      const data = await response.json();
      if (data.success) {
        socket.emit('fileChange');
      }
    } catch (error) {
      console.error('Error creating item:', error);
    }
  }

  async function deleteItem(itemPath) {
    try {
      const response = await fetch('/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: itemPath
        })
      });
      
      const data = await response.json();
      if (data.success) {
        socket.emit('fileChange');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  }

  async function renameItem(oldPath, newPath) {
    try {
      const response = await fetch('/rename', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          oldPath,
          newPath
        })
      });
      
      const data = await response.json();
      if (data.success) {
        socket.emit('fileChange');
      }
    } catch (error) {
      console.error('Error renaming item:', error);
    }
  }

  // Show create dialog function
  function showCreateDialog() {
    // Create a modal dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.style.position = 'fixed';
    dialog.style.top = '50%';
    dialog.style.left = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.style.backgroundColor = 'var(--secondaryColor)';
    dialog.style.border = '1px solid var(--borderColor)';
    dialog.style.borderRadius = '8px';
    dialog.style.padding = '20px';
    dialog.style.zIndex = '1000';
    dialog.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    dialog.style.minWidth = '300px';

    // Modal content
    dialog.innerHTML = `
      <h3 style="margin-top: 0; border-bottom: 1px solid var(--borderColor); padding-bottom: 10px;">Create New</h3>
      <div style="display: flex; gap: 15px; margin: 15px 0;">
        <div class="create-option" data-type="folder" style="cursor: pointer; text-align: center; padding: 10px; border-radius: 5px;">
          <img src="/src/images/folder-icon.jpg" style="width: 48px; height: 48px;">
          <div>Folder</div>
        </div>
        <div class="create-option" data-type="file" style="cursor: pointer; text-align: center; padding: 10px; border-radius: 5px;">
          <img src="/src/images/txt-icon.png" style="width: 48px; height: 48px;">
          <div>File</div>
        </div>
      </div>
      <div class="name-input-container" style="display: none; margin-top: 15px;">
        <label for="new-item-name">Enter name:</label>
        <input type="text" id="new-item-name" style="width: 100%; padding: 8px; margin-top: 5px; background-color: var(--secondaryColor); color: var(--textColor); border: 1px solid var(--borderColor);">
      </div>
      <div style="display: flex; justify-content: flex-end; margin-top: 20px; gap: 10px;">
        <button id="cancel-create" style="padding: 8px 15px; background-color: transparent; border: 1px solid var(--borderColor); color: var(--textColor); cursor: pointer;">Cancel</button>
        <button id="confirm-create" style="padding: 8px 15px; background-color: #0078d7; border: none; color: white; cursor: pointer; display: none;">Create</button>
      </div>
    `;

    // Add event listeners
    let selectedType = null;
    
    // After appending to DOM
    document.body.appendChild(dialog);
    
    // Add click events for type selection
    const options = dialog.querySelectorAll('.create-option');
    options.forEach(option => {
      option.addEventListener('mouseenter', () => {
        option.style.backgroundColor = 'var(--hoverBackgroundColor)';
      });
      
      option.addEventListener('mouseleave', () => {
        if (option.dataset.type !== selectedType) {
          option.style.backgroundColor = '';
        }
      });
      
      option.addEventListener('click', () => {
        // Reset all options
        options.forEach(opt => {
          opt.style.backgroundColor = '';
          opt.style.border = '';
        });
        
        // Highlight selected option
        option.style.backgroundColor = 'var(--hoverBackgroundColor)';
        option.style.border = '1px solid var(--borderColor)';
        
        // Store selected type
        selectedType = option.dataset.type;
        
        // Show name input
        dialog.querySelector('.name-input-container').style.display = 'block';
        dialog.querySelector('#confirm-create').style.display = 'block';
        
        // Set focus on input
        const input = dialog.querySelector('#new-item-name');
        input.focus();
        
        // Set default name
        if (selectedType === 'folder') {
          input.value = 'New Folder';
        } else {
          input.value = 'New File.txt';
        }
        input.select();
      });
    });
    
    // Cancel button
    dialog.querySelector('#cancel-create').addEventListener('click', () => {
      dialog.remove();
    });
    
    // Create button
    dialog.querySelector('#confirm-create').addEventListener('click', () => {
      const name = dialog.querySelector('#new-item-name').value.trim();
      if (name && selectedType) {
        createNewItem(selectedType, name);
        dialog.remove();
      }
    });
    
    // Enter key in input
    dialog.querySelector('#new-item-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const name = e.target.value.trim();
        if (name && selectedType) {
          createNewItem(selectedType, name);
          dialog.remove();
        }
      }
    });
    
    // Close on background click
    document.addEventListener('click', (e) => {
      if (!dialog.contains(e.target) && e.target !== newButton) {
        dialog.remove();
      }
    }, { once: true });
  }

  async function loadDirectoryWithoutHistory(path) {
    try {
      const response = await fetch(`/files?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      
      currentPath = data.currentPath;
      pathContainer.textContent = currentPath;
      
      // Clear and populate the main section
      mainSection.innerHTML = '';
      
      data.items.forEach(item => {
        const card = createFileCard(item);
        mainSection.appendChild(card);
      });
      
      // Update file count
      updateFileCountStatus(data.items.length);
      
      // Apply the current sort
      if (currentSortField && currentSortDirection) {
        sortAndDisplayItems();
      }
    } catch (error) {
      console.error('Error loading directory:', error);
    }
  }

  function deleteSelectedItems() {
    if (confirm(`Delete ${selectedItems.length} selected items?`)) {
      selectedItems.forEach(async (itemPath) => {
        await deleteItem(itemPath);
      });
      selectedItems = [];
    }
  }

  async function pasteItems() {
    try {
      if (clipboard.items.length === 0) {
        console.log('Clipboard is empty');
        return;
      }
      
      console.log(`Pasting ${clipboard.items.length} items with operation: ${clipboard.operation}`);
      
      for (const sourcePath of clipboard.items) {
        const fileName = pathModule.basename(sourcePath);
        const destinationPath = pathModule.join(currentPath, fileName);
        
        console.log(`Processing: ${sourcePath} to ${destinationPath}`);
        
        if (clipboard.operation === 'copy') {
          await copyItem(sourcePath, destinationPath);
        } else if (clipboard.operation === 'cut') {
          await moveItem(sourcePath, destinationPath);
        }
      }
      
      // Clear clipboard if operation was cut
      if (clipboard.operation === 'cut') {
        clipboard.items = [];
        clipboard.operation = '';
      }
      
      // Refresh the directory view
      loadCurrentDirectory(currentPath);
    } catch (error) {
      console.error('Error pasting items:', error);
    }   
  }

  async function copyItem(sourcePath, destinationPath) {
    try {
      const response = await fetch('/copy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourcePath,
          destinationPath
        })
      });
      
      const data = await response.json();
      if (data.success) {
        socket.emit('fileChange');
      }
    } catch (error) {
      console.error('Error copying item:', error);
    }
  }

  async function moveItem(sourcePath, destinationPath) {
    try {
      const response = await fetch('/move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourcePath,
          destinationPath
        })
      });
      
      const data = await response.json();
      if (data.success) {
        socket.emit('fileChange');
      }
    } catch (error) {
      console.error('Error moving item:', error);
    }
  }

  // Improved sort function
  function sortAndDisplayItems() {
    // Get current items from the DOM
    const fileCards = Array.from(document.querySelectorAll('.folderCard'));
    if (fileCards.length === 0) return;
  
    // Create an array of objects for sorting
    const items = fileCards.map(card => {
      const nameElement = card.querySelector('span');
      return {
        element: card,
        name: nameElement ? nameElement.textContent : '',
        isDirectory: card.dataset.isDirectory === 'true',
        path: card.dataset.path,
        // Get size and date from data attributes, with fallbacks
        size: parseInt(card.dataset.size || '0', 10),
        modified: card.dataset.modified || new Date().toISOString(),
        // Extract file extension for type sorting
        extension: card.dataset.isDirectory === 'true' ? '' : 
                  (nameElement?.textContent?.split('.').pop() || '')
      };
    });
  
    // Sort the items
    items.sort((a, b) => {
      // Always put directories first
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      
      // Then sort by the selected field
      let comparison = 0;
      switch (currentSortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
          break;
        case 'type':
          // First compare extension
          comparison = a.extension.localeCompare(b.extension);
          // If same extension or both are directories, sort by name
          if (comparison === 0) {
            comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
          }
          break;
        case 'size':
          comparison = a.size - b.size;
          // If same size or size is not available, sort by name
          if (comparison === 0) {
            comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
          }
          break;
        case 'modified':
          try {
            const timeA = new Date(a.modified).getTime();
            const timeB = new Date(b.modified).getTime();
            comparison = timeA - timeB;
          } catch (error) {
            comparison = 0;
          }
          // If same date or date is not available, sort by name
          if (comparison === 0) {
            comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
          }
          break;
        default:
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
      }
      
      // Apply sort direction
      return currentSortDirection === 'asc' ? comparison : -comparison;
    });
    
    // Clear and re-add to the DOM in sorted order
    mainSection.innerHTML = '';
    
    items.forEach(item => {
      mainSection.appendChild(item.element);
    });
    
    console.log(`Sorted by ${currentSortField} (${currentSortDirection})`);
  }

  // Function to display sort options
  function showSortDialog(event) {
    // Remove existing sort dialog if any
    const existingDialog = document.querySelector('.sort-dialog');
    if (existingDialog) {
      existingDialog.remove();
    }
  
    // Create a sort dialog
    const dialog = document.createElement('div');
    dialog.className = 'sort-dialog';
    dialog.style.position = 'absolute';
    dialog.style.backgroundColor = 'var(--secondaryColor)';
    dialog.style.border = '1px solid var(--borderColor)';
    dialog.style.borderRadius = '5px';
    dialog.style.padding = '10px';
    dialog.style.zIndex = '1000';
    dialog.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    dialog.style.minWidth = '180px';
  
    // Position the dialog relative to the sort button
    const buttonRect = event.target.getBoundingClientRect();
    dialog.style.top = `${buttonRect.bottom + window.scrollY + 5}px`;
    dialog.style.right = `${window.innerWidth - buttonRect.right - window.scrollX}px`;
  
    // Sort options
    dialog.innerHTML = `
      <div style="border-bottom: 1px solid var(--borderColor); padding-bottom: 5px; margin-bottom: 5px;">
        <b>Sort by</b>
      </div>
      <div class="sort-option" data-field="name" data-direction="asc" style="padding: 8px 10px; cursor: pointer;">
        Name (A to Z) ${currentSortField === 'name' && currentSortDirection === 'asc' ? '✓' : ''}
      </div>
      <div class="sort-option" data-field="name" data-direction="desc" style="padding: 8px 10px; cursor: pointer;">
        Name (Z to A) ${currentSortField === 'name' && currentSortDirection === 'desc' ? '✓' : ''}
      </div>
      <div class="sort-option" data-field="type" data-direction="asc" style="padding: 8px 10px; cursor: pointer;">
        Type ${currentSortField === 'type' && currentSortDirection === 'asc' ? '✓' : ''}
      </div>
      <div class="sort-option" data-field="size" data-direction="desc" style="padding: 8px 10px; cursor: pointer;">
        Size ${currentSortField === 'size' && currentSortDirection === 'desc' ? '✓' : ''}
      </div>
      <div class="sort-option" data-field="modified" data-direction="desc" style="padding: 8px 10px; cursor: pointer;">
        Date modified ${currentSortField === 'modified' && currentSortDirection === 'desc' ? '✓' : ''}
      </div>
    `;
  
    // Add event listeners to options
    document.body.appendChild(dialog);
    const options = dialog.querySelectorAll('.sort-option');
    options.forEach(option => {
      option.addEventListener('mouseenter', () => {
        option.style.backgroundColor = 'var(--hoverBackgroundColor)';
      });
      
      option.addEventListener('mouseleave', () => {
        option.style.backgroundColor = '';
      });
      
      option.addEventListener('click', () => {
        currentSortField = option.dataset.field;
        currentSortDirection = option.dataset.direction;
        sortAndDisplayItems();
        dialog.remove();
      });
    });
  
    // Close dialog when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!dialog.contains(e.target) && e.target !== sortButton) {
        dialog.remove();
      }
    }, { once: true });
  }

  // Function to toggle between different view modes
  function toggleViewMode() {
    const mainSection = document.querySelector('.mainSection');
    if (!mainSection) return;
    
    if (mainSection.classList.contains('list-view')) {
      applyGridLayout('grid-6'); // Default grid view
    } else {
      applyGridLayout('list-view'); // List view
    }
  }

  // Initialize view mode from localStorage on page load
  function initializeViewMode() {
    initializeViewSettings();
  }

  function showContextMenu(event, item) {
    // Create context menu
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.position = 'absolute';
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.style.backgroundColor = 'var(--secondaryColor)';
    contextMenu.style.border = '1px solid var(--borderColor)';
    contextMenu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    contextMenu.style.padding = '5px 0';
    contextMenu.style.zIndex = '1000';

    // Menu items
    const menuItems = [
      { 
        label: 'Open', 
        action: () => { 
          if (item.isDirectory) {
            loadCurrentDirectory(item.path);
          } else {
            // For files, use a fetch request to open the file
            window.open(`/open?path=${encodeURIComponent(item.path)}`, '_blank');
          }
        } 
      },
      { 
        label: 'Copy', 
        action: () => { 
          clipboard.items = [item.path];
          clipboard.operation = 'copy';
          console.log('Copied to clipboard:', item.path);
        } 
      },
      { 
        label: 'Cut', 
        action: () => { 
          clipboard.items = [item.path];
          clipboard.operation = 'cut';
          console.log('Cut to clipboard:', item.path);
        } 
      },
      { 
        label: 'Paste', 
        action: pasteItems, 
        disabled: clipboard.items.length === 0 
      },
      { 
        label: 'Rename', 
        action: () => { 
          // Find the corresponding DOM element for this item
          const cardElement = [...document.querySelectorAll('.folderCard')]
            .find(card => card.dataset.path === item.path);
          if (cardElement) {
            const nameSpan = cardElement.querySelector('span');
            if (nameSpan) {
              // Enable editing
              nameSpan.contentEditable = true;
              nameSpan.focus();
              
              // Select all text
              const range = document.createRange();
              range.selectNodeContents(nameSpan);
              const selection = window.getSelection();
              selection.removeAllRanges();
              selection.addRange(range);
              
              // Handle Enter key to save
              nameSpan.addEventListener('keydown', async (evt) => {
                if (evt.key === 'Enter') {
                  evt.preventDefault();
                  const newName = nameSpan.textContent.trim();
                  if (newName !== item.name) {
                    // Construct new path
                    const newPath = pathModule.join(pathModule.dirname(item.path), newName);
                    await renameItem(item.path, newPath);
                  }
                  nameSpan.contentEditable = false;
                }
              }, { once: true });
              
              // Handle blur to cancel editing
              nameSpan.addEventListener('blur', () => {
                nameSpan.contentEditable = false;
                nameSpan.textContent = item.name; // Reset if canceled
              }, { once: true });
            }
          }
        } 
      },
      { 
        label: 'Delete', 
        action: () => { 
          if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
            deleteItem(item.path).then(() => {
              // The socket.emit in deleteItem will trigger a refresh
              console.log(`Deleted ${item.path}`);
            });
          } 
        } 
      }
    ];
    
    menuItems.forEach(menuItem => {
      if (!menuItem.disabled) {
        const menuItemElement = document.createElement('div');
        menuItemElement.textContent = menuItem.label;
        menuItemElement.style.padding = '8px 10px';
        menuItemElement.style.cursor = 'pointer';
        
        menuItemElement.addEventListener('mouseenter', () => {
          menuItemElement.style.backgroundColor = 'var(--hoverBackgroundColor)';
        });
        
        menuItemElement.addEventListener('mouseleave', () => {
          menuItemElement.style.backgroundColor = '';
        });
        
        menuItemElement.addEventListener('click', () => {
          menuItem.action();
          contextMenu.remove();
        });
        
        contextMenu.appendChild(menuItemElement);
      }
    });
    
    // Add to DOM
    document.body.appendChild(contextMenu);
    
    // Close context menu when clicking elsewhere
    document.addEventListener('click', () => {
      contextMenu.remove();
    }, { once: true });
    
    // Prevent default context menu
    event.preventDefault();
  }

  // Helper function to show a notification
  function showNotification(message, duration = 2000) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    notification.style.color = 'white';
    notification.style.padding = '10px 15px';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '9999';
    notification.style.transition = 'opacity 0.3s';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  // Function to update file count
  function updateFileCountStatus(count) {
    const statusElement = document.querySelector('.statusBar') || document.createElement('div');
    if (!statusElement.classList.contains('statusBar')) {
      statusElement.className = 'statusBar';
      statusElement.style.padding = '5px 10px';
      statusElement.style.borderTop = '1px solid var(--borderColor)';
      statusElement.style.fontSize = '0.9em';
      document.querySelector('.main').appendChild(statusElement);
    }
    
    statusElement.textContent = `${count} item${count !== 1 ? 's' : ''}`;
  }

  // Add keyboard shortcuts for convenience
  document.addEventListener('keydown', (e) => {
    // Only respond if not in input fields
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' || 
        document.activeElement.isContentEditable) {
      return;
    }
      
    // Copy: Ctrl+C
    if (e.ctrlKey && e.key === 'c' && copyButton) {
      e.preventDefault();
      copyButton.click();
    }
    
    // Cut: Ctrl+X
    if (e.ctrlKey && e.key === 'x' && cutButton) {
      e.preventDefault();
      cutButton.click();
    }
    
    // Paste: Ctrl+V
    if (e.ctrlKey && e.key === 'v' && pasteButton) {
      e.preventDefault();
      pasteButton.click();
    }
    
    // Delete: Delete key
    if (e.key === 'Delete' && selectedItems.length > 0) {
      e.preventDefault();
      deleteSelectedItems();
    }
  });

  // Function to handle view button click - show options for grid layout and theme
  function showViewDialog(event) {
    // Remove existing view dialog if any
    const existingDialog = document.querySelector('.view-dialog');
    if (existingDialog) {
      existingDialog.remove();
      return;
    }
  
    // Create a view options dialog
    const dialog = document.createElement('div');
    dialog.className = 'view-dialog';
    dialog.style.position = 'absolute';
    dialog.style.backgroundColor = 'var(--secondaryColor)';
    dialog.style.border = '1px solid var(--borderColor)';
    dialog.style.borderRadius = '5px';
    dialog.style.padding = '10px';
    dialog.style.zIndex = '1000';
    dialog.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    dialog.style.minWidth = '180px';
  
    // Position the dialog relative to the view button
    const buttonRect = event.target.getBoundingClientRect();
    dialog.style.top = `${buttonRect.bottom + window.scrollY + 5}px`;
    dialog.style.right = `${window.innerWidth - buttonRect.right - window.scrollX}px`;
  
    // Current theme and view settings
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const currentGridClass = Array.from(mainSection.classList).find(c => c.startsWith('grid-')) || 'grid-6';
    const currentGridColumns = currentGridClass.split('-')[1] || '6';
  
    // View options
    dialog.innerHTML = `
      <div style="border-bottom: 1px solid var(--borderColor); padding-bottom: 5px; margin-bottom: 5px;">
        <b>View Options</b>
      </div>
      <div style="margin-bottom: 10px;">
        <div style="font-weight: bold; margin-bottom: 5px;">Grid Size</div>
        <div class="view-option grid-option" data-grid="grid-6" style="padding: 8px 10px; cursor: pointer; display: flex; align-items: center;">
          <div style="width: 30px; margin-right: 10px; display: flex; justify-content: center;">
            <i class="ri-layout-grid-fill"></i>
          </div>
          <span>Small icons ${currentGridColumns === '6' ? '✓' : ''}</span>
        </div>
        <div class="view-option grid-option" data-grid="grid-4" style="padding: 8px 10px; cursor: pointer; display: flex; align-items: center;">
          <div style="width: 30px; margin-right: 10px; display: flex; justify-content: center;">
            <i class="ri-layout-grid-fill" style="font-size: 1.2em;"></i>
          </div>
          <span>Medium icons ${currentGridColumns === '4' ? '✓' : ''}</span>
        </div>
        <div class="view-option grid-option" data-grid="grid-3" style="padding: 8px 10px; cursor: pointer; display: flex; align-items: center;">
          <div style="width: 30px; margin-right: 10px; display: flex; justify-content: center;">
            <i class="ri-layout-grid-fill" style="font-size: 1.4em;"></i>
          </div>
          <span>Large icons ${currentGridColumns === '3' ? '✓' : ''}</span>
        </div>
        <div class="view-option grid-option" data-grid="list-view" style="padding: 8px 10px; cursor: pointer; display: flex; align-items: center;">
          <div style="width: 30px; margin-right: 10px; display: flex; justify-content: center;">
            <i class="ri-list-check"></i>
          </div>
          <span>List view ${mainSection.classList.contains('list-view') ? '✓' : ''}</span>
        </div>
      </div>
      <div style="border-top: 1px solid var(--borderColor); padding-top: 10px;">
        <div style="font-weight: bold; margin-bottom: 5px;">Theme</div>
        <div class="view-option theme-option" data-theme="dark" style="padding: 8px 10px; cursor: pointer; display: flex; align-items: center;">
          <div style="width: 30px; margin-right: 10px; display: flex; justify-content: center;">
            <i class="ri-moon-fill"></i>
          </div>
          <span>Dark theme ${currentTheme === 'dark' ? '✓' : ''}</span>
        </div>
        <div class="view-option theme-option" data-theme="light" style="padding: 8px 10px; cursor: pointer; display: flex; align-items: center;">
          <div style="width: 30px; margin-right: 10px; display: flex; justify-content: center;">
            <i class="ri-sun-fill"></i>
          </div>
          <span>Light theme ${currentTheme === 'light' ? '✓' : ''}</span>
        </div>
      </div>
    `;
  
    // Add to DOM
    document.body.appendChild(dialog);
  
    // Add event listeners for grid options
    const gridOptions = dialog.querySelectorAll('.grid-option');
    gridOptions.forEach(option => {
      option.addEventListener('mouseenter', () => {
        option.style.backgroundColor = 'var(--hoverBackgroundColor)';
      });
      
      option.addEventListener('mouseleave', () => {
        option.style.backgroundColor = '';
      });
      
      option.addEventListener('click', () => {
        const gridClass = option.getAttribute('data-grid');
        applyGridLayout(gridClass);
        dialog.remove();
      });
    });
  
    // Add event listeners for theme options
    const themeOptions = dialog.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
      option.addEventListener('mouseenter', () => {
        option.style.backgroundColor = 'var(--hoverBackgroundColor)';
      });
      
      option.addEventListener('mouseleave', () => {
        option.style.backgroundColor = '';
      });
      
      option.addEventListener('click', () => {
        const theme = option.getAttribute('data-theme');
        applyTheme(theme);
        dialog.remove();
      });
    });
  
    // Close dialog when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!dialog.contains(e.target) && !e.target.closest('.filterContainer span:last-child')) {
        dialog.remove();
      }
    }, { once: true });
  }
  
  // Function to apply the grid layout
  function applyGridLayout(gridClass) {
    const mainSection = document.querySelector('.mainSection');
    if (!mainSection) return;
  
    // Remove all grid and list classes
    mainSection.classList.remove('list-view', 'grid-3', 'grid-4', 'grid-6');
    
    // Add the selected class
    mainSection.classList.add(gridClass);
    
    // Save the preference
    localStorage.setItem('viewMode', gridClass);
    
    // Add CSS styles if they don't exist
    if (!document.getElementById('grid-styles')) {
      addGridStyles();
    }
    
    console.log(`Applied layout: ${gridClass}`);
  }
  
  // Function to apply a theme
  function applyTheme(theme) {
    // Get the root element
    const root = document.documentElement;
    
    // Set the theme attribute for future reference
    root.setAttribute('data-theme', theme);
  
    // Apply theme variables
    if (theme === 'light') {
      root.style.setProperty('--primaryColor', '#ffffff');
      root.style.setProperty('--secondaryColor', '#ffffff');
      root.style.setProperty('--textColor', '#000000');
      root.style.setProperty('--borderColor', '#9f8aff');
      root.style.setProperty('--secondaryBorderColor', 'crimson');
      root.style.setProperty('--hoverBackgroundColor', '#c5d2ff');
      root.style.setProperty('--shadowColor', '#e4e3e4');
      root.style.setProperty('--filterValue', 'saturate(300%) sepia(2) brightness(2) hue-rotate(-170deg)');
    } else {
      // Dark theme (default)
      root.style.setProperty('--primaryColor', '#111111');
      root.style.setProperty('--secondaryColor', '#000000');
      root.style.setProperty('--textColor', '#eee');
      root.style.setProperty('--borderColor', '#eeeeee');
      root.style.setProperty('--secondaryBorderColor', 'crimson');
      root.style.setProperty('--hoverBackgroundColor', '#343434');
      root.style.removeProperty('--shadowColor');
      root.style.removeProperty('--filterValue');
    }
    
    // Save theme preference
    localStorage.setItem('theme', theme);
    
    console.log(`Applied theme: ${theme}`);
  }
  
  // Add grid styles to the document
  function addGridStyles() {
    const styleElement = document.createElement('style');
    styleElement.id = 'grid-styles';
    styleElement.textContent = `
      .mainSection.grid-6 {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      
      .mainSection.grid-6 .folderCard {
        width: 100px;
        height: 100px;
        margin: 5px;
      }
      
      .mainSection.grid-4 {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
      }
      
      .mainSection.grid-4 .folderCard {
        width: 130px;
        height: 130px;
        margin: 5px;
      }
      
      .mainSection.grid-3 {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
      }
      
      .mainSection.grid-3 .folderCard {
        width: 160px;
        height: 160px;
        margin: 5px;
      }
      
      .mainSection.list-view {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      
      .mainSection.list-view .folderCard {
        width: 100%;
        height: 40px;
        display: flex;
        align-items: center;
        padding: 0 10px;
        margin-bottom: 5px;
      }
      
      .mainSection.list-view .folderIconContainer {
        width: 30px;
        height: 30px;
        margin-right: 10px;
      }
      
      .mainSection.list-view .folderCard span {
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;
    
    document.head.appendChild(styleElement);
  }
  
  // Initialize view settings
  function initializeViewSettings() {
    // Add grid styles
    if (!document.getElementById('grid-styles')) {
      addGridStyles();
    }
    
    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
    
    // Initialize view mode
    const savedViewMode = localStorage.getItem('viewMode') || 'grid-6';
    applyGridLayout(savedViewMode);
  }
  
  // Call the initializeViewSettings function on page load
  initializeViewSettings();

  // Add this code to periodically refresh the drives list
  function setupDriveRefresh() {
    // Initial load
    loadDrives();
    
    // Refresh drives list every 30 seconds to detect new USB drives
    setInterval(() => {
      loadDrives();
    }, 30000);
    
    // Also listen for file change events that might indicate drive changes
    socket.on('update', (data) => {
      // Refresh drives when receiving general updates
      loadDrives();
    });
  }
  
  // Call this function on page load
  setupDriveRefresh();
});