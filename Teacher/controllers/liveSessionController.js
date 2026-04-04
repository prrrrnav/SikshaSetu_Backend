const liveSessionModel = require('../models/liveSessionModel');
const courseModel = require('../models/courseModel');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const { bucket, admin } = require('../../config/Firebase');

exports.scheduleLiveSession = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { sessionTitle, shortDescription, courseId, sessionHeading, date, time } = req.body;

    if (!sessionTitle || !shortDescription || !sessionHeading || !date || !time) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const teacher = await require('../models/teacherModel').getTeacherById(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (courseId) {
      const course = await courseModel.getCourseById(courseId);
      if (!course || course.teacherId !== teacherId) {
        return res.status(400).json({ message: 'Invalid course' });
      }
    }

    const scheduledDate = new Date(date);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const session = await liveSessionModel.createLiveSession({
      teacherId,
      orgId: teacher.orgId,
      sessionTitle,
      shortDescription,
      courseId,
      sessionHeading,
      scheduledDate: scheduledDate.toISOString(),
      scheduledTime: time
    });

    res.status(201).json({
      message: 'Live session scheduled successfully',
      sessionId: session.sessionId
    });
  } catch (error) {
    console.error('Schedule live session error:', error);
    res.status(500).json({ message: 'Failed to schedule session' });
  }
};

exports.startLiveSession = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;
    
    // PHASE 4: Defensive check for body parsing failure
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error("[Session Start] Request body is missing or empty. Check for PayloadTooLargeError.");
      return res.status(400).json({ 
        message: "Failed to start session: Slide data was not received correctly.",
        debug: "Request body is empty. This is usually caused by an oversized slide image payload."
      });
    }

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Allow starting session if already active (teacher re-entering)
    // FIX 3b: Accept initial slide data from request body
    const { currentSlideImage, currentSlideIndex } = req.body;

    await liveSessionModel.updateLiveSession(id, {
      isActive: true,
      currentSlideImage: currentSlideImage ?? null,
      currentSlideIndex: currentSlideIndex ?? 0,
      startedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({ message: 'Live session started' });
  } catch (error) {
    console.error('Start live session error trace:', error);
    res.status(500).json({ 
      message: 'Failed to start session',
      error: error.message 
    });
  }
};

exports.endLiveSession = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (!session.isActive) {
      return res.status(400).json({ message: 'Session not active' });
    }

    await liveSessionModel.endLiveSession(id);

    res.status(200).json({ message: 'Live session ended' });
  } catch (error) {
    console.error('End live session error:', error);
    res.status(500).json({ message: 'Failed to end session' });
  }
};

exports.uploadMaterial = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // if (!session.isActive) {
    //   return res.status(400).json({ message: 'Session not active' });
    // }

    const processedFiles = await uploadMiddleware.processMultipleFiles(req.files, 'default');

    const uploadPromises = processedFiles.map(async (file) => {
      const fileName = `live-sessions/${id}/${file.filename}`;
      const fileUpload = bucket.file(fileName);

      await fileUpload.save(file.buffer, {
        metadata: {
          contentType: file.mimetype
        }
      });

      await fileUpload.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

      return {
        fileName: file.filename,
        url: publicUrl,
        uploadTime: new Date().toISOString(),
        size: file.size
      };
    });

    const materials = await Promise.all(uploadPromises);

    for (const material of materials) {
      await liveSessionModel.addMaterial(id, material);
    }

    const { getIO } = require('../../socket');
    const io = getIO();
    materials.forEach(material => {
      io.of('/live-session').to(id).emit('material-uploaded', { sessionId: id, material });
    });

    res.status(200).json({
      message: 'Materials uploaded successfully',
      materials
    });
  } catch (error) {
    console.error('Upload material error:', error);
    res.status(500).json({ message: 'Failed to upload materials' });
  }
};

exports.getLiveSessions = async (req, res) => {
  try {
    const teacherId = req.user.userId;

    const sessions = await liveSessionModel.getLiveSessionsByTeacherId(teacherId);

    res.status(200).json({ sessions });
  } catch (error) {
    console.error('Get live sessions error:', error);
    res.status(500).json({ message: 'Failed to fetch sessions' });
  }
};

exports.getLiveSession = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.status(200).json({ session });
  } catch (error) {
    console.error('Get live session error:', error);
    res.status(500).json({ message: 'Failed to fetch session' });
  }
};

exports.getUnderstoodCount = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.status(200).json({ understoodCount: session.understoodCount || 0 });
  } catch (error) {
    console.error('Get understood count error:', error);
    res.status(500).json({ message: 'Failed to fetch understood count' });
  }
};

exports.changeSlide = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;
    const { slideIndex } = req.body;

    if (slideIndex === undefined || slideIndex === null) {
      return res.status(400).json({ message: 'Slide index is required' });
    }

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (!session.isActive) {
      return res.status(400).json({ message: 'Session not active' });
    }

    await liveSessionModel.updateLiveSession(id, {
      currentSlideIndex: slideIndex
    });

    const { getIO } = require('../../socket');
    const io = getIO();
    io.of('/live-session').to(id).emit('slide-changed', {
      slideIndex
    });

    res.status(200).json({ message: 'Slide changed successfully' });
  } catch (error) {
    console.error('Change slide error:', error);
    res.status(500).json({ message: 'Failed to change slide' });
  }
};

exports.uploadSlides = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;
    const { slides } = req.body;

    if (!slides || !Array.isArray(slides)) {
      return res.status(400).json({ message: 'Slides array required' });
    }

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // FIX 2: Pre-populate slide data during upload
    const firstSlide = slides[0];
    const initialSlideImage = typeof firstSlide === 'string' ? firstSlide : firstSlide?.imageUrl;

    await liveSessionModel.updateLiveSession(id, {
      slides: slides,
      currentSlideIndex: 0,
      currentSlideImage: initialSlideImage ?? null
    });

    const { getIO } = require('../../socket');
    const io = getIO();
    io.of('/live-session').to(id).emit('slides-updated', { slides });

    res.status(200).json({ message: 'Slides uploaded successfully' });
  } catch (error) {
    console.error('Upload slides error:', error);
    res.status(500).json({ message: 'Failed to upload slides' });
  }
};

exports.deleteLiveSession = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;
    
    console.log('Delete Request - UserID:', teacherId, 'SessionID:', id);

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      console.warn('Session not found for deletion:', id);
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.teacherId !== teacherId) {
      console.warn('Unauthorized delete attempt - Session Teacher:', session.teacherId, 'Request Teacher:', teacherId);
      return res.status(403).json({ message: 'Unauthorized to delete this session' });
    }

    await liveSessionModel.deleteLiveSession(id);
    console.log('Session deleted successfully:', id);

    res.status(200).json({ message: 'Live session deleted successfully' });
  } catch (error) {
    console.error('Delete live session error:', error);
    res.status(500).json({ message: 'Failed to delete session', error: error.message });
  }
};

exports.debugAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await liveSessionModel.getLiveSessionById(id);
    
    res.status(200).json({
      sessionId: id,
      isActive: session?.isActive,
      participants: session?.participants?.length || 0,
      message: 'Check browser console for WebRTC logs'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};