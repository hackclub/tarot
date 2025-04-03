import path from 'path'
import { readdir, stat, unlink } from 'fs/promises'

// Function to clean up old files
export async function cleanupOldFiles() {
  try {
    const uploadsDir = path.join(process.cwd(), 'docs/temp');
    const files = await readdir(uploadsDir);
    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000); // 1 minute in milliseconds

    for (const file of files) {
      if (file === '.keep') continue; // Skip the .keep file
      
      const filePath = path.join(uploadsDir, file);
      const stats = await stat(filePath);
      
      if (stats.mtimeMs < oneMinuteAgo) {
        await unlink(filePath);
        console.log(`Deleted old file: ${file}`);
      }
    }
  } catch (err) {
    console.error('Error cleaning up old files:', err);
  }
} 