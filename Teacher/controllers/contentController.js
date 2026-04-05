const contentModel = require('../models/contentModel');
const teacherModel = require('../models/teacherModel');
const courseModel = require('../models/courseModel');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const fileUpload = require('../utils/fileUpload');

exports.uploadContent = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { title, description, courseId, audioIndices: audioIndicesRaw } = req.body;
    const audioIndices = audioIndicesRaw ? JSON.parse(audioIndicesRaw) : [];

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    if (!req.files || !req.files.slides) {
      return res.status(400).json({ message: 'Slides are required' });
    }

    if (req.files.slides.length === 0) {
      return res.status(400).json({ message: 'At least one slide is required' });
    }

    const teacher = await teacherModel.getTeacherById(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (courseId) {
      const course = await courseModel.getCourseById(courseId);
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }
      if (course.teacherId !== teacherId) {
        return res.status(403).json({ message: 'Access denied to this course' });
      }
    }

    let processedSlides, processedAudios;
    try {
      processedSlides = await uploadMiddleware.processMultipleFiles(req.files.slides, 'slide');
      processedAudios = req.files.audio ? await uploadMiddleware.processMultipleFiles(req.files.audio, 'audio') : [];
    } catch (error) {
      console.error('File processing error:', error);
      return res.status(500).json({ message: 'Failed to process files: ' + error.message });
    }

    let uploadedSlides, uploadedAudios;
    try {
      console.log('Starting storage upload...');
      uploadedSlides = await fileUpload.uploadMultipleToStorage(processedSlides, 'recorded_lectures/slides');
      uploadedAudios = processedAudios.length > 0 
        ? await fileUpload.uploadMultipleToStorage(processedAudios, 'recorded_lectures/audio') 
        : [];
      console.log(`Uploaded ${uploadedSlides.length} slides and ${uploadedAudios.length} audios.`);
    } catch (error) {
      console.error('Storage upload error:', error);
      return res.status(500).json({ message: 'Failed to upload files to storage: ' + error.message, error: error.message });
    }

    // Map uploaded audios to their respective slides using audioIndices
    const slideData = uploadedSlides.map((slide, index) => {
      const audioIdxPos = audioIndices.indexOf(index);
      const audioInfo = audioIdxPos !== -1 ? uploadedAudios[audioIdxPos] : null;

      return {
        url: slide.url,
        filePath: slide.filePath,
        filename: slide.filename,
        size: slide.size,
        index,
        audio: audioInfo ? {
          url: audioInfo.url,
          filePath: audioInfo.filePath,
          filename: audioInfo.filename,
          size: audioInfo.size
        } : null
      };
    });

    let content;
    try {
      console.log('Saving to Firestore...');
      content = await contentModel.createContent({
        teacherId,
        orgId: teacher.orgId,
        courseId: courseId || null,
        title,
        description,
        slides: slideData
      });
      console.log('Saved to Firestore successfully:', content.contentId);
    } catch (error) {
      console.error('Database error:', error);
      return res.status(500).json({ message: 'Failed to save lecture metadata: ' + error.message, error: error.message });
    }

    res.status(201).json({
      message: 'Recorded lecture uploaded successfully',
      contentId: content.contentId,
      content
    });
  } catch (error) {
    console.error('CRITICAL CONTENT UPLOAD ERROR:', error);
    res.status(500).json({ 
      message: 'An internal server error occurred during upload', 
      error: error.message,
      stack: error.stack
    });
  }
};

exports.getContents = async (req, res) => {
  try {
    const teacherId = req.user.userId;

    const contents = await contentModel.getContentsByTeacherId(teacherId);

    res.status(200).json({ contents });
  } catch (error) {
    console.error('Contents fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch recorded lectures' });
  }
};

exports.getContent = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;

    const content = await contentModel.getContentById(id);
    if (!content) {
      return res.status(404).json({ message: 'Recorded lecture not found' });
    }

    if (content.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.status(200).json({ content });
  } catch (error) {
    console.error('Content fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch recorded lecture' });
  }
};

exports.updateContent = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;
    const { title, description, courseId } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const content = await contentModel.getContentById(id);
    if (!content) {
      return res.status(404).json({ message: 'Recorded lecture not found' });
    }

    if (content.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (courseId) {
      const course = await courseModel.getCourseById(courseId);
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }
      if (course.teacherId !== teacherId) {
        return res.status(403).json({ message: 'Access denied to this course' });
      }
    }

    await contentModel.updateContent(id, {
      title,
      description,
      courseId: courseId || null
    });

    res.status(200).json({ message: 'Recorded lecture updated successfully' });
  } catch (error) {
    console.error('Content update error:', error);
    res.status(500).json({ message: 'Failed to update recorded lecture' });
  }
};

exports.deleteContent = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;

    const content = await contentModel.getContentById(id);
    if (!content) {
      return res.status(404).json({ message: 'Recorded lecture not found' });
    }

    if (content.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const filePaths = [
      content.audio.filePath,
      ...content.slides.map(slide => slide.filePath)
    ];

    await fileUpload.deleteMultipleFromStorage(filePaths);
    await contentModel.deleteContent(id);

    res.status(200).json({ message: 'Recorded lecture deleted successfully' });
  } catch (error) {
    console.error('Content deletion error:', error);
    res.status(500).json({ message: 'Failed to delete recorded lecture' });
  }
};