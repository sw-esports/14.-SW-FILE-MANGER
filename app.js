const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const fs = require('fs'); // Regular fs for existsSync
const fsPromises = fs.promises; // For async operations
const { createServer } = require('http');
const { Server } = require('socket.io');
const os = require('os');

// Create HTTP server
const server = createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('fileChange', () => {
    // Broadcast to all clients that a file change occurred
    io.emit('update', { message: 'Files updated' });
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Utility function to safely handle path traversal attempts
function sanitizePath(inputPath) {
  // Resolve the path to remove any ".." segments
  const safePath = path.resolve(inputPath);
  return safePath;
}

// Routes
app.get('/', (req, res) => {
    res.render('index', { title: 'File Explorer' });
});

// Improved files endpoint with proper drive handling
app.get('/files', async (req, res) => {
  try {
    let requestedPath = req.query.path || '';
    
    // Get user's home directory if no path provided
    if (!requestedPath) {
      requestedPath = os.homedir();
    }
    
    // For Windows, handle drive letter paths properly
    if (process.platform === 'win32' && /^[A-Z]:[\\/]?$/i.test(requestedPath)) {
      // Ensure drive letter path ends with backslash
      if (!requestedPath.endsWith('\\')) {
        requestedPath += '\\';
      }
    }
    
    // Check if the path exists and is accessible
    try {
      await fsPromises.access(requestedPath, fs.constants.R_OK);
    } catch (error) {
      return res.status(403).json({ 
        error: `Access denied to ${requestedPath}. You may not have permission to access this location.` 
      });
    }
    
    // Get directory contents
    const items = await fsPromises.readdir(requestedPath, { withFileTypes: true });
    const fileList = [];
    
    for (const item of items) {
      try {
        const fullPath = path.join(requestedPath, item.name);
        let stats;
        
        try {
          stats = await fsPromises.stat(fullPath);
        } catch (error) {
          console.log(`Unable to get stats for ${fullPath}: ${error.message}`);
          continue; // Skip this file/folder if we can't access it
        }
        
        fileList.push({
          name: item.name,
          path: fullPath,
          isDirectory: item.isDirectory(),
          size: stats.size,
          modified: stats.mtime
        });
      } catch (error) {
        console.log(`Error processing ${item.name}: ${error.message}`);
        // Skip items we can't process properly
      }
    }
    
    res.json({
      currentPath: requestedPath,
      items: fileList
    });
  } catch (error) {
    console.error('Error in /files endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Updated drives endpoint with better USB drive detection
app.get('/drives', async (req, res) => {
  try {
    if (process.platform === 'win32') {
      // For Windows, check drives from A to Z
      const drives = [];
      
      // Check for removable drives first using child_process
      const { exec } = require('child_process');
      
      exec('wmic logicaldisk get caption,description,drivetype', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing drive detection command: ${error.message}`);
          // Fall back to simple detection
          simpleDriveDetection();
          return;
        }
        
        if (stderr) {
          console.error(`Command stderr: ${stderr}`);
          simpleDriveDetection();
          return;
        }
        
        // Parse WMIC output
        // Drive types: 2=Removable, 3=Fixed, 4=Network, 5=Optical
        const lines = stdout.split('\n');
        const driveData = [];
        
        lines.forEach(line => {
          const match = line.match(/([A-Z]:)\s+(.+?)\s+(\d+)/);
          if (match) {
            const [, drive, description, type] = match;
            driveData.push({
              drive,
              description: description.trim(),
              type: parseInt(type.trim())
            });
          }
        });
        
        // Add drives to the result, with removable (USB) drives at the top
        const removableDrives = driveData.filter(d => d.type === 2).map(d => d.drive);
        const fixedDrives = driveData.filter(d => d.type === 3).map(d => d.drive);
        const otherDrives = driveData.filter(d => ![2, 3].includes(d.type)).map(d => d.drive);
        
        // Combine arrays with removable drives first
        const allDrives = [...removableDrives, ...fixedDrives, ...otherDrives];
        
        res.json({ drives: allDrives });
      });
      
      // Simple detection as fallback
      function simpleDriveDetection() {
        const checkDrives = async () => {
          const drives = [];
          for (let i = 65; i <= 90; i++) {
            const driveLetter = String.fromCharCode(i);
            try {
              await fsPromises.access(`${driveLetter}:\\`);
              drives.push(`${driveLetter}:`);
            } catch {
              // Drive doesn't exist or is not accessible
            }
          }
          res.json({ drives });
        };
        
        checkDrives();
      }
    } else {
      // For non-Windows platforms, just return root
      res.json({ drives: ['/'] });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new file or folder
app.post('/create', async (req, res) => {
  try {
    const { type, path: folderPath, name } = req.body;
    const newItemPath = path.join(sanitizePath(folderPath), name);
    
    if (type === 'folder') {
      await fsPromises.mkdir(newItemPath, { recursive: true });
    } else if (type === 'file') {
      await fsPromises.writeFile(newItemPath, '', { flag: 'wx' });
    }
    
    res.json({ success: true, path: newItemPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a file or folder
app.delete('/delete', async (req, res) => {
  try {
    const { path: itemPath } = req.body;
    const safePath = sanitizePath(itemPath);
    
    const stats = await fsPromises.stat(safePath);
    if (stats.isDirectory()) {
      await fsPromises.rmdir(safePath, { recursive: true });
    } else {
      await fsPromises.unlink(safePath);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rename a file or folder
app.put('/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    const safeOldPath = sanitizePath(oldPath);
    const safeNewPath = sanitizePath(newPath);
    
    await fsPromises.rename(safeOldPath, safeNewPath);
    res.json({ success: true, newPath: safeNewPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Copy file or folder
app.post('/copy', async (req, res) => {
  try {
    const { sourcePath, destinationPath } = req.body;
    const safeSourcePath = sanitizePath(sourcePath);
    const safeDestinationPath = sanitizePath(destinationPath);
    
    const stats = await fsPromises.stat(safeSourcePath);
    
    if (stats.isDirectory()) {
      // For directories, we need to recursively copy
      await copyDirectory(safeSourcePath, safeDestinationPath);
    } else {
      // For files, we can use copyFile
      await fsPromises.copyFile(safeSourcePath, safeDestinationPath);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error copying:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cut (move) file or folder
app.post('/move', async (req, res) => {
  try {
    const { sourcePath, destinationPath } = req.body;
    const safeSourcePath = sanitizePath(sourcePath);
    const safeDestinationPath = sanitizePath(destinationPath);
    
    await fsPromises.rename(safeSourcePath, safeDestinationPath);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error moving:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to recursively copy directories
async function copyDirectory(source, destination) {
  // Create the destination directory
  await fsPromises.mkdir(destination, { recursive: true });
  
  // Get all items in the source directory
  const items = await fsPromises.readdir(source);
  
  // Copy each item
  for (const item of items) {
    const sourcePath = path.join(source, item);
    const destPath = path.join(destination, item);
    
    const stats = await fsPromises.stat(sourcePath);
    
    if (stats.isDirectory()) {
      // Recursively copy subdirectories
      await copyDirectory(sourcePath, destPath);
    } else {
      // Copy files
      await fsPromises.copyFile(sourcePath, destPath);
    }
  }
}

// Special folder navigation endpoint
app.get('/special-folder/:folderType', (req, res) => {
  try {
    const { folderType } = req.params;
    let folderPath = '';
    const homeDir = os.homedir();
    
    switch(folderType) {
      case 'home':
        folderPath = homeDir;
        break;
      case 'desktop':
        const oneDriveDesktop = path.join(homeDir, 'OneDrive', 'Desktop');
        const standardDesktop = path.join(homeDir, 'Desktop');
        
        // Check if OneDrive Desktop exists
        if (fs.existsSync(oneDriveDesktop)) {
          folderPath = oneDriveDesktop;
    
        } else {
          folderPath = standardDesktop;
        }
        break;
      case 'downloads':
        folderPath = path.join(homeDir, 'Downloads');
        break;
      case 'documents':
        folderPath = path.join(homeDir, 'Documents');
        break;
      case 'pictures':
        folderPath = path.join(homeDir, 'OneDrive/Pictures');
        break;
      case 'videos':
        folderPath = path.join(homeDir, 'Videos');
        break;
      case 'music':
      case 'musics':
        folderPath = path.join(homeDir, 'Music');
        break;
      case 'C:':
        folderPath = 'C:\\';
        break;
      default:
        return res.status(400).json({ error: 'Invalid folder type' });
    }
    
    res.json({ path: folderPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add this endpoint after your existing routes
// Serve image files for thumbnails
app.get('/thumbnail', (req, res) => {
  try {
    const imagePath = req.query.path;
    if (!imagePath) {
      return res.status(400).send('Image path is required');
    }
    
    const safePath = sanitizePath(imagePath);
    
    // Set appropriate content type based on file extension
    const ext = path.extname(safePath).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    
    if (contentTypes[ext]) {
      res.setHeader('Content-Type', contentTypes[ext]);
      // Stream the file instead of loading it all into memory
      fs.createReadStream(safePath).pipe(res);
    } else {
      res.status(415).send('Unsupported image format');
    }
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).send('Error serving image');
  }
});

// Special endpoint to handle drive navigation
app.get('/drive/:driveLetter', (req, res) => {
  const { driveLetter } = req.params;
  
  // Ensure drive letter ends with ":"
  const formattedDrive = driveLetter.endsWith(':') ? driveLetter : `${driveLetter}:`;
  
  // On Windows, add backslash for proper path
  const drivePath = process.platform === 'win32' ? `${formattedDrive}\\` : formattedDrive;
  
  res.json({ path: drivePath });
});

server.listen(port, () => {   
    console.log(`Server is running on http://localhost:${port}`);
});