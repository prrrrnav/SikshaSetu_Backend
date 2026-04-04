require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { initializeSocket } = require('./socket');

const authRoutes = require('./Auth/routes/authRoutes');
const organizationRoutes = require('./Organization/routes/organizationRoutes');
const teacherRoutes = require('./Teacher/routes/teacherRoutes');
const studentRoutes = require('./Student/routes/studentRoutes');
const adminRoutes = require('./Admin/routes/adminRoutes');

const app = express();
const server = http.createServer(app);
const io = initializeSocket(server);

app.use(cors({
  
  origin: true,
  credentials: true
}));


app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());



app.use('/api/auth', authRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.send('SikshaSetu Backend');
});

const PORT = process.env.PORT || 8928;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server running on ws://localhost:${PORT}`);
  console.log(`Audio streaming optimized for Opus 16kbps with FEC`);
});