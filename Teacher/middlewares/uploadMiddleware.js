const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const { exec } = require('child_process');
const os = require('os');
const execPromise = promisify(exec);

const UPLOAD_LIMITS = {
  IMAGE: {
    maxSize: 10 * 1024 * 1024, // 10MB
    targetSize: { min: 1 * 1024 * 1024, max: 3 * 1024 * 1024 }, // 1-3MB
    maxFiles: 5
  },
  DOCUMENT: {
    maxSize: 20 * 1024 * 1024, // 20MB
    targetSize: { min: 3 * 1024 * 1024, max: 8 * 1024 * 1024 }, // 3-8MB
    maxFiles: 5
  },
  AUDIO: {
    maxSize: 50 * 1024 * 1024, // 50MB
    targetSize: { min: 2 * 1024 * 1024, max: 10 * 1024 * 1024 }, // 2-10MB
    maxFiles: 1
  },
  SLIDES: {
    maxSize: 10 * 1024 * 1024, // 10MB per slide
    targetSize: { min: 500 * 1024, max: 2 * 1024 * 1024 }, // 500KB-2MB
    maxFiles: 50
  }
};

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'];
const ALLOWED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...AUDIO_EXTENSIONS];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
  }

  const isImage = IMAGE_EXTENSIONS.includes(ext);
  const isAudio = AUDIO_EXTENSIONS.includes(ext);
  const isDocument = DOCUMENT_EXTENSIONS.includes(ext);

  let maxSize = UPLOAD_LIMITS.DOCUMENT.maxSize;
  if (isImage) maxSize = UPLOAD_LIMITS.IMAGE.maxSize;
  if (isAudio) maxSize = UPLOAD_LIMITS.AUDIO.maxSize;

  if (file.size > maxSize) {
    return cb(new Error(`File too large. Max size: ${maxSize / (1024 * 1024)}MB`), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.AUDIO.maxSize,
    files: UPLOAD_LIMITS.SLIDES.maxFiles
  }
});

const compressImage = async (buffer, originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext);
  const outputName = `${baseName}_${Date.now()}.webp`;

  let quality = 90;
  let compressedBuffer;
  let targetMin = UPLOAD_LIMITS.IMAGE.targetSize.min;
  let targetMax = UPLOAD_LIMITS.IMAGE.targetSize.max;

  const image = sharp(buffer);
  const metadata = await image.metadata();

  let width = metadata.width;
  if (width > 2048) {
    width = 2048;
  }

  while (quality >= 70) {
    compressedBuffer = await sharp(buffer)
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();

    if (compressedBuffer.length >= targetMin && compressedBuffer.length <= targetMax) {
      break;
    }

    if (compressedBuffer.length < targetMin && quality < 90) {
      quality += 5;
      compressedBuffer = await sharp(buffer)
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality: Math.min(quality, 90), effort: 4 })
        .toBuffer();
      break;
    }

    quality -= 5;
  }

  return {
    buffer: compressedBuffer,
    filename: outputName,
    size: compressedBuffer.length,
    mimetype: 'image/webp'
  };
};

const compressSlide = async (buffer, originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext);
  const outputName = `${baseName}_${Date.now()}.webp`;

  let quality = 85;
  let compressedBuffer;
  let targetMin = UPLOAD_LIMITS.SLIDES.targetSize.min;
  let targetMax = UPLOAD_LIMITS.SLIDES.targetSize.max;

  const image = sharp(buffer);
  const metadata = await image.metadata();

  let width = metadata.width;
  if (width > 1920) {
    width = 1920;
  }

  while (quality >= 65) {
    compressedBuffer = await sharp(buffer)
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();

    if (compressedBuffer.length >= targetMin && compressedBuffer.length <= targetMax) {
      break;
    }

    if (compressedBuffer.length < targetMin && quality < 85) {
      quality += 5;
      compressedBuffer = await sharp(buffer)
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality: Math.min(quality, 85), effort: 4 })
        .toBuffer();
      break;
    }

    quality -= 5;
  }

  return {
    buffer: compressedBuffer,
    filename: outputName,
    size: compressedBuffer.length,
    mimetype: 'image/webp'
  };
};

// const compressPDF = async (buffer, originalName) => {
//   const ext = path.extname(originalName).toLowerCase();
//   const baseName = path.basename(originalName, ext);
//   const outputName = `${baseName}_${Date.now()}.pdf`;

//   try {
//     const pdfDoc = await PDFDocument.load(buffer);
//     const pdfBytes = await pdfDoc.save({
//       useObjectStreams: true,
//       addDefaultPage: false,
//       objectsPerTick: 50
//     });

//     const compressedBuffer = Buffer.from(pdfBytes);
//     const targetMin = UPLOAD_LIMITS.DOCUMENT.targetSize.min;
//     const targetMax = UPLOAD_LIMITS.DOCUMENT.targetSize.max;

//     if (compressedBuffer.length >= targetMin && compressedBuffer.length <= targetMax) {
//       return {
//         buffer: compressedBuffer,
//         filename: outputName,
//         size: compressedBuffer.length,
//         mimetype: 'application/pdf'
//       };
//     }

//     if (compressedBuffer.length > targetMax) {
//       return {
//         buffer: compressedBuffer,
//         filename: outputName,
//         size: compressedBuffer.length,
//         mimetype: 'application/pdf'
//       };
//     }

//     return {
//       buffer: compressedBuffer,
//       filename: outputName,
//       size: compressedBuffer.length,
//       mimetype: 'application/pdf'
//     };
//   } catch (error) {
//     return {
//       buffer,
//       filename: outputName,
//       size: buffer.length,
//       mimetype: 'application/pdf'
//     };
//   }
// };

let gsAvailable = null;
let ffmpegAvailable = null;

const checkCommand = async (cmd) => {
  try {
    const checkCmd = os.platform() === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    await execPromise(checkCmd);
    return true;
  } catch {
    return false;
  }
};


const compressPDF = async (buffer, originalName) => {
  const initialSize = buffer.length;
  const tempInput = path.join(os.tmpdir(), `${Date.now()}_in.pdf`);
  const tempOutput = path.join(os.tmpdir(), `${Date.now()}_out.pdf`);
  const baseName = path.basename(originalName, '.pdf');

  // Check availability once
  if (gsAvailable === null) {
    gsAvailable = await checkCommand('gs');
  }

  if (!gsAvailable) {
    // If not available, skip quietly without logs unless it's a huge file
    if (initialSize > 10 * 1024 * 1024) {
      console.warn("ℹ️ PDF compression skipped: Ghostscript not installed.");
    }
    return { buffer, filename: originalName, size: buffer.length, mimetype: 'application/pdf' };
  }

  console.log(`--- PDF Compression Started: ${originalName} ---`);
  console.log(`Original Size: ${(initialSize / (1024 * 1024)).toFixed(2)} MB (${initialSize} bytes)`);

  try {
    await fs.writeFile(tempInput, buffer);
    const gsCommand = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile=${tempOutput} ${tempInput}`;
    await execPromise(gsCommand);

    const compressedBuffer = await fs.readFile(tempOutput);
    const finalSize = compressedBuffer.length;
    const savedBytes = initialSize - finalSize;
    const reductionPercent = ((savedBytes / initialSize) * 100).toFixed(2);

    console.log(`Compressed Size: ${(finalSize / (1024 * 1024)).toFixed(2)} MB (${finalSize} bytes)`);
    console.log(`Result: ${reductionPercent}% reduction (${(savedBytes / 1024).toFixed(2)} KB saved)`);
    console.log(`-----------------------------------------------`);

    await Promise.all([
      fs.unlink(tempInput).catch(() => {}), 
      fs.unlink(tempOutput).catch(() => {})
    ]);

    return {
      buffer: compressedBuffer,
      filename: `${baseName}_${Date.now()}.pdf`,
      size: finalSize,
      mimetype: 'application/pdf'
    };
  } catch (error) {
    // If it somehow fails here even after checkCommand, just return original
    await fs.unlink(tempInput).catch(() => {});
    return { buffer, filename: originalName, size: buffer.length, mimetype: 'application/pdf' };
  }
};

// const compressDocument = async (buffer, originalName, mimetype) => {
//   const ext = path.extname(originalName).toLowerCase();
//   const baseName = path.basename(originalName, ext);
//   const outputName = `${baseName}_${Date.now()}${ext}`;

//   const targetMin = UPLOAD_LIMITS.DOCUMENT.targetSize.min;
//   const targetMax = UPLOAD_LIMITS.DOCUMENT.targetSize.max;

//   if (buffer.length >= targetMin && buffer.length <= targetMax) {
//     return {
//       buffer,
//       filename: outputName,
//       size: buffer.length,
//       mimetype
//     };
//   }

//   return {
//     buffer,
//     filename: outputName,
//     size: buffer.length,
//     mimetype
//   };
// };

const zlib = require('zlib');
const gzip = promisify(zlib.gzip);

const compressDocument = async (buffer, originalName, mimetype) => {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext);
  
  try {
    // For Office docs, we use Gzip to try and shave off extra bytes 
    // though the gains here are usually smaller (5-10%)
    const compressedBuffer = await gzip(buffer, { level: 9 });

    return {
      buffer: compressedBuffer,
      filename: `${baseName}_${Date.now()}${ext}`,
      size: compressedBuffer.length,
      mimetype
    };
  } catch (error) {
    return { buffer, filename: originalName, size: buffer.length, mimetype };
  }
};

const compressAudio = async (buffer, originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext);
  const tempInput = path.join(os.tmpdir(), `${Date.now()}_input${ext}`);
  const tempOutput = path.join(os.tmpdir(), `${Date.now()}_output.mp3`);

  // Check availability once
  if (ffmpegAvailable === null) {
    ffmpegAvailable = await checkCommand('ffmpeg');
  }

  if (!ffmpegAvailable) {
    // Skip silently if missing
    return { 
      buffer, 
      filename: originalName, 
      size: buffer.length, 
      mimetype: 'audio/mpeg' 
    };
  }

  try {
    await fs.writeFile(tempInput, buffer);

    let bitrate = '128k';
    const targetMin = UPLOAD_LIMITS.AUDIO.targetSize.min;
    const targetMax = UPLOAD_LIMITS.AUDIO.targetSize.max;

    if (buffer.length > targetMax) {
      bitrate = '96k';
    } else if (buffer.length < targetMin) {
      bitrate = '192k';
    }

    await new Promise((resolve, reject) => {
      ffmpeg(tempInput)
        .audioBitrate(bitrate)
        .audioChannels(2)
        .audioFrequency(44100)
        .format('mp3')
        .audioCodec('libmp3lame')
        .on('end', resolve)
        .on('error', reject)
        .save(tempOutput);
    });

    const compressedBuffer = await fs.readFile(tempOutput);

    await fs.unlink(tempInput).catch(() => {});
    await fs.unlink(tempOutput).catch(() => {});

    return {
      buffer: compressedBuffer,
      filename: `${baseName}_${Date.now()}.mp3`,
      size: compressedBuffer.length,
      mimetype: 'audio/mpeg'
    };
  } catch (error) {
    await fs.unlink(tempInput).catch(() => {});
    await fs.unlink(tempOutput).catch(() => {});

    return {
      buffer,
      filename: `${baseName}_${Date.now()}${ext}`,
      size: buffer.length,
      mimetype: 'audio/mpeg'
    };
  }
};

const processFile = async (file, type = 'default') => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (type === 'slide') {
    if (IMAGE_EXTENSIONS.includes(ext)) {
      return await compressSlide(file.buffer, file.originalname);
    } else if (DOCUMENT_EXTENSIONS.includes(ext)) {
      return await compressDocument(file.buffer, file.originalname, file.mimetype);
    }
  }
  
  if (type === 'audio' && AUDIO_EXTENSIONS.includes(ext)) {
    return await compressAudio(file.buffer, file.originalname);
  }
  
  if (IMAGE_EXTENSIONS.includes(ext)) {
    return await compressImage(file.buffer, file.originalname);
  } else if (ext === '.pdf') {
    return await compressPDF(file.buffer, file.originalname);
  } else if (AUDIO_EXTENSIONS.includes(ext)) {
    return await compressAudio(file.buffer, file.originalname);
  } else {
    return await compressDocument(file.buffer, file.originalname, file.mimetype);
  }
};

const processMultipleFiles = async (files, type = 'default') => {
  const processPromises = files.map(file => processFile(file, type));
  return await Promise.all(processPromises);
};

const uploadMiddleware = {
  single: (fieldName) => upload.single(fieldName),
  multiple: (fieldName, maxCount = 5) => upload.array(fieldName, maxCount),
  fields: (fields) => upload.fields(fields),
  processFile,
  processMultipleFiles,
  UPLOAD_LIMITS,
  IMAGE_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
  AUDIO_EXTENSIONS
};

module.exports = uploadMiddleware;