const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const courseController = require('../controllers/courseController');
const resourceController = require('../controllers/resourceController');
const contentController = require('../controllers/contentController');
const liveSessionController = require('../controllers/liveSessionController');
const chatController = require('../controllers/chatcontroller');
const quizController = require('../controllers/quizController');
const discussionController = require('../controllers/discussionController');
const aiController = require('../controllers/aiController');
const analyticsController = require('../controllers/analyticsController');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const { authenticate, authorizeRoles, authorizeSharedRoles } = require('../../Auth/middlewares/authMiddleware');

router.post('/register', teacherController.register);
router.get('/subjects', teacherController.getSubjects);
router.get('/dashboard', authenticate, authorizeRoles('teacher'), teacherController.getDashboard);

router.post('/course', authenticate, authorizeRoles('teacher'), courseController.createCourse);
router.get('/course/:id', authenticate, authorizeSharedRoles('teacher', 'student'), courseController.getCourse);
router.put('/course/:id', authenticate, authorizeRoles('teacher'), courseController.updateCourse);
router.delete('/course/:id', authenticate, authorizeRoles('teacher'), courseController.deleteCourse);
router.get('/courses', authenticate, authorizeSharedRoles('teacher', 'student'), courseController.getCourses);

router.post('/resource', authenticate, authorizeRoles('teacher'), uploadMiddleware.single('file'), resourceController.uploadResource);
router.get('/resource/:id', authenticate, authorizeRoles('teacher'), resourceController.getResource);
router.put('/resource/:id', authenticate, authorizeRoles('teacher'), resourceController.updateResource);
router.delete('/resource/:id', authenticate, authorizeRoles('teacher'), resourceController.deleteResource);
router.get('/resources', authenticate, authorizeRoles('teacher'), resourceController.getResources);
router.get('/resource-types', resourceController.getResourceTypes);

router.post('/content/upload', authenticate, authorizeRoles('teacher'), uploadMiddleware.fields([
  { name: 'slides', maxCount: 50 },
  { name: 'audio', maxCount: 1 }
]), contentController.uploadContent);
router.get('/content/:id', authenticate, authorizeRoles('teacher'), contentController.getContent);
router.put('/content/:id', authenticate, authorizeRoles('teacher'), contentController.updateContent);
router.delete('/content/:id', authenticate, authorizeRoles('teacher'), contentController.deleteContent);
router.get('/content', authenticate, authorizeRoles('teacher'), contentController.getContents);

router.post('/live-session/schedule', authenticate, authorizeRoles('teacher'), liveSessionController.scheduleLiveSession);
router.post('/live-session/start/:id', authenticate, authorizeRoles('teacher'), liveSessionController.startLiveSession);
router.post('/live-session/end/:id', authenticate, authorizeRoles('teacher'), liveSessionController.endLiveSession);
router.delete('/live-session/:id', authenticate, authorizeRoles('teacher'), liveSessionController.deleteLiveSession);
router.post('/live-session/upload-material/:id', authenticate, authorizeRoles('teacher'), uploadMiddleware.multiple('files', 10), liveSessionController.uploadMaterial);
router.post('/live-session/change-slide/:id', authenticate, authorizeRoles('teacher'), liveSessionController.changeSlide);
router.post('/live-session/upload-slides/:id', authenticate, authorizeRoles('teacher'), liveSessionController.uploadSlides);
router.get('/live-session/debug-audio/:id', authenticate, authorizeRoles('teacher'), liveSessionController.debugAudio);
router.get('/live-session/:id', authenticate, authorizeRoles('teacher'), liveSessionController.getLiveSession);
router.get('/live-session/:id/chat', authenticate, authorizeRoles('teacher'), chatController.getSessionChat);
router.get('/live-session/:id/understood', authenticate, authorizeRoles('teacher'), liveSessionController.getUnderstoodCount);
router.get('/live-session', authenticate, authorizeRoles('teacher'), liveSessionController.getLiveSessions);

router.post('/quiz', authenticate, authorizeRoles('teacher'), quizController.createQuiz);
router.get('/quiz/:id', authenticate, authorizeRoles('teacher'), quizController.getQuiz);
router.put('/quiz/:id', authenticate, authorizeRoles('teacher'), quizController.updateQuiz);
router.delete('/quiz/:id', authenticate, authorizeRoles('teacher'), quizController.deleteQuiz);
router.get('/quiz/:id/responses', authenticate, authorizeRoles('teacher'), quizController.getQuizResponses);
router.get('/quiz/:id/responses/:responseId', authenticate, authorizeRoles('teacher'), quizController.getQuizResponseDetail);
router.get('/quizzes', authenticate, authorizeRoles('teacher'), quizController.getQuizzes);

router.get('/discussions/:id', authenticate, authorizeRoles('teacher'), discussionController.getDiscussionThread);
router.post('/discussions/:id/reply', authenticate, authorizeRoles('teacher'), uploadMiddleware.multiple('files', 5), discussionController.replyToDiscussion);
router.put('/discussions/:id/status', authenticate, authorizeRoles('teacher'), discussionController.updateDiscussionStatus);
router.get('/discussions', authenticate, authorizeRoles('teacher'), discussionController.getDiscussions);

router.post('/ai/ask', authenticate, authorizeRoles('teacher'), aiController.askAI);
router.get('/ai/capabilities', authenticate, authorizeRoles('teacher'), aiController.getAICapabilities);

router.get('/analytics/course/:id', authenticate, authorizeRoles('teacher'), analyticsController.getCourseAnalytics);
router.get('/analytics', authenticate, authorizeRoles('teacher'), analyticsController.getAnalytics);

module.exports = router;