const organizationModel = require('../../Organization/models/organizationModel');
const teacherModel = require('../../Teacher/models/teacherModel');
const studentModel = require('../../Student/models/studentModel');
const { 
  comparePassword, 
  generateToken, 
  generateOTP,
  saveOTP,
  getOTP,
  deleteOTP,
  saveToken,
  deleteToken
} = require('../services/authService');
const { sendEmail, emailTemplates } = require('../../utils/emailService');

exports.organizationLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const organization = await organizationModel.getOrganizationByEmail(email);
    if (!organization) {
      return res.status(404).json({ message: 'Invalid credentials' });
    }

    if (organization.status !== 'approved') {
      return res.status(403).json({ message: 'Organization not approved yet' });
    }

    const isPasswordValid = await comparePassword(password, organization.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken({
      userId: organization.orgId,
      orgId: organization.orgId,
      email: organization.email,
      role: 'organization',
      orgCode: organization.orgCode
    });

    saveToken(organization.orgId, token, 'organization').catch(() => {});

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 12 * 60 * 60 * 1000
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        orgId: organization.orgId,
        orgName: organization.orgName,
        email: organization.email,
        orgCode: organization.orgCode,
        role: 'organization'
      },
      token
    });
  } catch (error) {
    console.error('Organization login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

exports.organizationRequestOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const organization = await organizationModel.getOrganizationByEmail(email);
    if (!organization) {
      return res.status(404).json({ message: 'Invalid email' });
    }

    if (organization.status !== 'approved') {
      return res.status(403).json({ message: 'Organization not approved yet' });
    }

    const otp = generateOTP();
    
    await Promise.all([
      saveOTP(email, otp, 'organization'),
      sendEmail(
        email, 
        emailTemplates.loginOTP(organization.orgName, otp).subject,
        emailTemplates.loginOTP(organization.orgName, otp).html
      ).catch(() => {})
    ]);

    res.status(200).json({ message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Organization OTP request error:', error);
    res.status(500).json({ message: 'Failed to send OTP' });
  }
};

exports.organizationVerifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const [organization, otpData] = await Promise.all([
      organizationModel.getOrganizationByEmail(email),
      getOTP(email)
    ]);

    if (!organization) {
      return res.status(404).json({ message: 'Invalid email' });
    }

    if (!otpData) {
      return res.status(400).json({ message: 'OTP not found or expired' });
    }

    if (otpData.role !== 'organization') {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (otpData.expiresAt.toDate() < new Date()) {
      deleteOTP(email);
      return res.status(400).json({ message: 'OTP expired' });
    }

    if (otpData.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    deleteOTP(email);

    const token = generateToken({
      userId: organization.orgId,
      orgId: organization.orgId,
      email: organization.email,
      role: 'organization',
      orgCode: organization.orgCode
    });

    saveToken(organization.orgId, token, 'organization').catch(() => {});

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 12 * 60 * 60 * 1000
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        orgId: organization.orgId,
        orgName: organization.orgName,
        email: organization.email,
        orgCode: organization.orgCode,
        role: 'organization'
      },
      token
    });
  } catch (error) {
    console.error('Organization OTP verification error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

exports.teacherLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const teacher = await teacherModel.getTeacherByEmail(email);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (teacher.status !== 'approved') {
      return res.status(403).json({ message: 'Teacher account not approved yet' });
    }

    const isPasswordValid = await comparePassword(password, teacher.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken({
      userId: teacher.teacherId,
      email: teacher.email,
      role: 'teacher',
      orgId: teacher.orgId,
      orgCode: teacher.orgCode
    });

    saveToken(teacher.teacherId, token, 'teacher').catch(() => {});

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 12 * 60 * 60 * 1000
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        teacherId: teacher.teacherId,
        name: teacher.name,
        email: teacher.email,
        orgId: teacher.orgId,
        orgCode: teacher.orgCode,
        subject: teacher.subject,
        role: 'teacher'
      },
      token
    });
  } catch (error) {
    console.error('Teacher login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

exports.teacherRequestOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const teacher = await teacherModel.getTeacherByEmail(email);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (teacher.status !== 'approved') {
      return res.status(403).json({ message: 'Teacher account not approved yet' });
    }

    const otp = generateOTP();
    
    await Promise.all([
      saveOTP(email, otp, 'teacher'),
      sendEmail(
        email,
        emailTemplates.loginOTP(teacher.name, otp).subject,
        emailTemplates.loginOTP(teacher.name, otp).html
      ).catch(() => {})
    ]);

    res.status(200).json({ message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Teacher OTP request error:', error);
    res.status(500).json({ message: 'Failed to send OTP' });
  }
};

exports.teacherVerifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const [teacher, otpData] = await Promise.all([
      teacherModel.getTeacherByEmail(email),
      getOTP(email)
    ]);

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (!otpData) {
      return res.status(400).json({ message: 'OTP not found or expired' });
    }

    if (otpData.role !== 'teacher') {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (otpData.expiresAt.toDate() < new Date()) {
      deleteOTP(email);
      return res.status(400).json({ message: 'OTP expired' });
    }

    if (otpData.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    deleteOTP(email);

    const token = generateToken({
      userId: teacher.teacherId,
      email: teacher.email,
      role: 'teacher',
      orgId: teacher.orgId,
      orgCode: teacher.orgCode
    });

    saveToken(teacher.teacherId, token, 'teacher').catch(() => {});

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 12 * 60 * 60 * 1000
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        teacherId: teacher.teacherId,
        name: teacher.name,
        email: teacher.email,
        orgId: teacher.orgId,
        orgCode: teacher.orgCode,
        subject: teacher.subject,
        role: 'teacher'
      },
      token
    });
  } catch (error) {
    console.error('Teacher OTP verification error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

exports.studentLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const student = await studentModel.getStudentByEmail(email);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.status !== 'approved') {
      return res.status(403).json({ message: 'Student account not approved yet' });
    }

    const isPasswordValid = await comparePassword(password, student.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken({
      userId: student.studentId,
      email: student.email,
      role: 'student',
      orgId: student.orgId,
      orgCode: student.orgCode
    });

    saveToken(student.studentId, token, 'student').catch(() => {});

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 12 * 60 * 60 * 1000
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        studentId: student.studentId,
        studentName: student.studentName,
        email: student.email,
        orgId: student.orgId,
        orgCode: student.orgCode,
        subject: student.subject,
        role: 'student'
      },
      token
    });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

exports.studentRequestOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const student = await studentModel.getStudentByEmail(email);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.status !== 'approved') {
      return res.status(403).json({ message: 'Student account not approved yet' });
    }

    const otp = generateOTP();
    
    await Promise.all([
      saveOTP(email, otp, 'student'),
      sendEmail(
        email,
        emailTemplates.loginOTP(student.studentName, otp).subject,
        emailTemplates.loginOTP(student.studentName, otp).html
      ).catch(() => {})
    ]);

    res.status(200).json({ message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Student OTP request error:', error);
    res.status(500).json({ message: 'Failed to send OTP' });
  }
};

exports.studentVerifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const [student, otpData] = await Promise.all([
      studentModel.getStudentByEmail(email),
      getOTP(email)
    ]);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!otpData) {
      return res.status(400).json({ message: 'OTP not found or expired' });
    }

    if (otpData.role !== 'student') {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (otpData.expiresAt.toDate() < new Date()) {
      deleteOTP(email);
      return res.status(400).json({ message: 'OTP expired' });
    }

    if (otpData.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    deleteOTP(email);

    const token = generateToken({
      userId: student.studentId,
      email: student.email,
      role: 'student',
      orgId: student.orgId,
      orgCode: student.orgCode
    });

    saveToken(student.studentId, token, 'student').catch(() => {});

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 12 * 60 * 60 * 1000
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        studentId: student.studentId,
        studentName: student.studentName,
        email: student.email,
        orgId: student.orgId,
        orgCode: student.orgCode,
        subject: student.subject,
        role: 'student'
      },
      token
    });
  } catch (error) {
    console.error('Student OTP verification error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

exports.logout = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    deleteToken(userId);

    res.clearCookie('authToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Logout failed' });
  }
};