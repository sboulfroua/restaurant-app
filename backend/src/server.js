import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import initSocket from './socket.js';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// إعداد Socket.io للربط اللحظي عبر الشبكة المحلية
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// تفعيل استماع الأحداث
initSocket(io);

const PORT = 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on http://10.58.162.61:${PORT}`);
});