const resourceModel = require('../models/resourceModel');
const teacherModel = require('../models/teacherModel');
const courseModel = require('../models/courseModel');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const fileUpload = require('../utils/fileUpload');

exports.uploadResource = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { title, resourceType, courseId } = req.body;

    if (!title || !resourceType) {
      return res.status(400).json({ message: 'Title and resource type are required' });
    }

    if (!resourceModel.RESOURCE_TYPES.includes(resourceType)) {
      return res.status(400).json({ message: 'Invalid resource type' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
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

    const processedFile = await uploadMiddleware.processFile(req.file);

    const uploadedFile = await fileUpload.uploadToStorage(
      processedFile.buffer,
      processedFile.filename,
      processedFile.mimetype,
      'resources'
    );

    console.log(`Final size in Firebase: ${uploadedFile.size} bytes`);
    
    const resource = await resourceModel.createResource({
      teacherId,
      orgId: teacher.orgId,
      courseId: courseId || null,
      title,
      resourceType,
      fileUrl: uploadedFile.url,
      filePath: uploadedFile.filePath,
      filename: uploadedFile.filename,
      fileSize: uploadedFile.size,
      mimetype: uploadedFile.mimetype
    });

    res.status(201).json({
      message: 'Resource uploaded successfully',
      resourceId: resource.resourceId,
      resource
    });
  } catch (error) {
    console.error('Resource upload error:', error);
    res.status(500).json({ message: 'Failed to upload resource' });
  }
};

exports.getResources = async (req, res) => {
  try {
    const teacherId = req.user.userId;

    const resources = await resourceModel.getResourcesByTeacherId(teacherId);

    res.status(200).json({ resources });
  } catch (error) {
    console.error('Resources fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch resources' });
  }
};

exports.getResource = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;

    const resource = await resourceModel.getResourceById(id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (resource.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.status(200).json({ resource });
  } catch (error) {
    console.error('Resource fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch resource' });
  }
};

exports.updateResource = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;
    const { title, resourceType, courseId } = req.body;

    if (!title || !resourceType) {
      return res.status(400).json({ message: 'Title and resource type are required' });
    }

    if (!resourceModel.RESOURCE_TYPES.includes(resourceType)) {
      return res.status(400).json({ message: 'Invalid resource type' });
    }

    const resource = await resourceModel.getResourceById(id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (resource.teacherId !== teacherId) {
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

    await resourceModel.updateResource(id, {
      title,
      resourceType,
      courseId: courseId || null
    });

    res.status(200).json({ message: 'Resource updated successfully' });
  } catch (error) {
    console.error('Resource update error:', error);
    res.status(500).json({ message: 'Failed to update resource' });
  }
};

exports.deleteResource = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;

    const resource = await resourceModel.getResourceById(id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (resource.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await fileUpload.deleteFromStorage(resource.filePath);
    await resourceModel.deleteResource(id);

    res.status(200).json({ message: 'Resource deleted successfully' });
  } catch (error) {
    console.error('Resource deletion error:', error);
    res.status(500).json({ message: 'Failed to delete resource' });
  }
};

exports.getResourceTypes = async (req, res) => {
  try {
    res.status(200).json({ resourceTypes: resourceModel.RESOURCE_TYPES });
  } catch (error) {
    console.error('Resource types fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch resource types' });
  }
};