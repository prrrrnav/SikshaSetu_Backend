const liveSessionModel = require('../../Teacher/models/liveSessionModel');
const courseModel = require('../../Teacher/models/courseModel');

exports.getAvailableSessions = async (req, res) => {
  try {
    const studentId = req.user.userId;
    const student = await require('../models/studentModel').getStudentById(studentId);
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const { db } = require('../../config/Firebase');
    const now = new Date();
    
    const sessionsSnapshot = await db
      .collection("liveSessions")
      .where("orgId", "==", student.orgId)
      .get();

    let sessions = sessionsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        sessionId: data.sessionId || doc.id, // Explicit sessionId mapping
        ...data
      };
    });

    // DEBUG: Log how many we found before filtering
    console.log(`[Student-Query] Found ${sessions.length} sessions total for org: ${student.orgId}`);

    // Filter out sessions that have already ended (endedAt exists)
    // Scheduled sessions (endedAt is null/missing) and Live sessions (isActive) should both appear.
    sessions = sessions.filter(session => !session.endedAt);
    
    // Final check: if isActive is false and it's ancient but endedAt is somehow null, 
    // it's likely a zombie scheduled class from the past. For now, we show all future ones.

    // Sort: Live first, then Scheduled by date
    sessions.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return new Date(a.scheduledDate || a.createdAt) - new Date(b.scheduledDate || b.createdAt);
    });

    const sessionsWithCourseInfo = await Promise.all(
      sessions.map(async (session) => {
        let courseInfo = null;
        if (session.courseId) {
          const course = await courseModel.getCourseById(session.courseId);
          if (course) {
            courseInfo = {
              courseCode: course.courseCode,
              courseName: course.courseName
            };
          }
        }
        return {
          ...session,
          course: courseInfo
        };
      })
    );

    res.status(200).json({ sessions: sessionsWithCourseInfo });
  } catch (error) {
    console.error('Get available sessions error:', error);
    res.status(500).json({ message: 'Failed to fetch sessions' });
  }
};

exports.getAllSessions = async (req, res) => {
  try {
    const studentId = req.user.userId;
    const student = await require('../models/studentModel').getStudentById(studentId);
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const { db } = require('../../config/Firebase');
    
    const sessionsSnapshot = await db
      .collection("liveSessions")
      .where("orgId", "==", student.orgId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const sessionsWithCourseInfo = await Promise.all(
      sessions.map(async (session) => {
        let courseInfo = null;
        if (session.courseId) {
          const course = await courseModel.getCourseById(session.courseId);
          if (course) {
            courseInfo = {
              courseCode: course.courseCode,
              courseName: course.courseName
            };
          }
        }
        return {
          ...session,
          course: courseInfo
        };
      })
    );

    res.status(200).json({ sessions: sessionsWithCourseInfo });
  } catch (error) {
    console.error('Get all sessions error:', error);
    res.status(500).json({ message: 'Failed to fetch sessions' });
  }
};

exports.getSessionDetails = async (req, res) => {
  try {
    const studentId = req.user.userId;
    const { id } = req.params;

    const student = await require('../models/studentModel').getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    let courseInfo = null;
    if (session.courseId) {
      const course = await courseModel.getCourseById(session.courseId);
      if (course) {
        courseInfo = {
          courseCode: course.courseCode,
          courseName: course.courseName,
          shortDescription: course.shortDescription
        };
      }
    }

    res.status(200).json({
      session: {
        ...session,
        course: courseInfo
      }
    });
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({ message: 'Failed to fetch session details' });
  }
};

exports.getSessionMaterials = async (req, res) => {
  try {
    const studentId = req.user.userId;
    const { id } = req.params;

    const student = await require('../models/studentModel').getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.status(200).json({
      materials: session.materials || []
    });
  } catch (error) {
    console.error('Get session materials error:', error);
    res.status(500).json({ message: 'Failed to fetch materials' });
  }
};

exports.getSessionChat = async (req, res) => {
  try {
    const studentId = req.user.userId;
    const { id } = req.params;

    const student = await require('../models/studentModel').getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const session = await liveSessionModel.getLiveSessionById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const { admin } = require('../../config/Firebase');
    const realtimeDb = admin.database();
    const chatRef = realtimeDb.ref(`liveSessions/${id}/chat`);
    const snapshot = await chatRef.once('value');
    
    const chatMessages = [];
    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        chatMessages.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });
    }

    res.status(200).json({ chat: chatMessages });
  } catch (error) {
    console.error('Get session chat error:', error);
    res.status(500).json({ message: 'Failed to fetch chat' });
  }
};