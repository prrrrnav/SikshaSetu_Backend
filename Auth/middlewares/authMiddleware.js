const { verifyToken, getToken } = require('../services/authService');

exports.authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.authToken || req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const tokenData = await getToken(decoded.userId);
    if (!tokenData || tokenData.token !== token) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    if (tokenData.expiresAt.toDate() < new Date()) {
      return res.status(401).json({ message: 'Token expired' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Authentication failed' });
  }
};

exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Access denied. Role is: ${req.user.role}. Expected: ${roles.join(', ')}` });
    }
    next();
  };
};

exports.authorizeSharedRoles = (...allowedRolePairs) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    const flatRoles = allowedRolePairs.flat();
    
    if (!flatRoles.includes(userRole)) {
      return res.status(403).json({ message: `Access denied. Role is: ${userRole}. Expected: ${flatRoles.join(', ')}` });
    }
    next();
  };
};