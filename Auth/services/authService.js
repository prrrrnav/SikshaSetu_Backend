const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db, admin } = require('../../config/Firebase');

const otpCollection = db.collection('otps');
const tokenCollection = db.collection('tokens');

const generateOrgCode = (orgName) => {
  const prefix = orgName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${suffix}`;
};

const generatePassword = () => {
  const length = 10;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const saveOTP = async (identifier, otp, role) => {
  await otpCollection.doc(identifier).set({
    otp,
    role,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000)),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

const getOTP = async (identifier) => {
  const doc = await otpCollection.doc(identifier).get();
  if (!doc.exists) return null;
  return doc.data();
};

const deleteOTP = async (identifier) => {
  otpCollection.doc(identifier).delete().catch(() => {});
};

const saveToken = async (userId, token, role) => {
  const expirationDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
  
  await tokenCollection.doc(userId).set({
    token,
    role,
    expiresAt: admin.firestore.Timestamp.fromDate(expirationDate),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    maxAge: 12 * 60 * 60 * 1000
  });
};

const getToken = async (userId) => {
  const doc = await tokenCollection.doc(userId).get();
  if (!doc.exists) return null;
  return doc.data();
};

const deleteToken = async (userId) => {
  tokenCollection.doc(userId).delete().catch(() => {});
};

module.exports = {
  generateOrgCode,
  generatePassword,
  generateOTP,
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  saveOTP,
  getOTP,
  deleteOTP,
  saveToken,
  getToken,
  deleteToken
};