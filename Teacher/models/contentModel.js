const { db, admin } = require('../../config/Firebase');

const contentCollection = db.collection('recorded_lectures');

const createContent = async (contentData) => {
  const contentRef = contentCollection.doc();
  const contentId = contentRef.id;

  const content = {
    contentId,
    teacherId: contentData.teacherId,
    orgId: contentData.orgId,
    courseId: contentData.courseId || null,
    title: contentData.title,
    description: contentData.description,
    slides: contentData.slides,
    duration: contentData.duration || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await contentRef.set(content);
  return { contentId, ...content };
};

const getContentsByTeacherId = async (teacherId) => {
  const snapshot = await contentCollection
    .where('teacherId', '==', teacherId)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const getContentById = async (contentId) => {
  const doc = await contentCollection.doc(contentId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

const updateContent = async (contentId, updateData) => {
  const data = {
    ...updateData,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await contentCollection.doc(contentId).update(data);
};

const deleteContent = async (contentId) => {
  await contentCollection.doc(contentId).delete();
};

const getContentsByCourseId = async (courseId) => {
  const snapshot = await contentCollection
    .where('courseId', '==', courseId)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

module.exports = {
  createContent,
  getContentsByTeacherId,
  getContentById,
  updateContent,
  deleteContent,
  getContentsByCourseId
};