const { bucket } = require('../../config/Firebase');
const path = require('path');

const uploadToStorage = async (buffer, filename, mimetype, folder = 'resources') => {
  const filePath = `${folder}/${Date.now()}_${filename}`;
  const file = bucket.file(filePath);

  const token = generateToken();
  await file.save(buffer, {
    metadata: {
      contentType: mimetype,
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    },
    resumable: false
  });

  // Construct standard Firebase Storage public URL
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;

  return {
    url,
    filePath,
    filename,
    size: buffer.length,
    mimetype
  };
};

const uploadMultipleToStorage = async (files, folder = 'resources') => {
  const uploadedFiles = [];
  for (const file of files) {
    const uploaded = await uploadToStorage(file.buffer, file.filename, file.mimetype, folder);
    uploadedFiles.push(uploaded);
  }
  return uploadedFiles;
};

const deleteFromStorage = async (filePath) => {
  try {
    const file = bucket.file(filePath);
    await file.delete();
    return true;
  } catch (error) {
    console.error('File deletion error:', error);
    return false;
  }
};

const deleteMultipleFromStorage = async (filePaths) => {
  const deletePromises = filePaths.map(filePath => deleteFromStorage(filePath));
  return await Promise.all(deletePromises);
};

const generateToken = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

module.exports = {
  uploadToStorage,
  uploadMultipleToStorage,
  deleteFromStorage,
  deleteMultipleFromStorage
};