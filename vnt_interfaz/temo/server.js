const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Users: { socketId: { username, avatarEmoji, color, status } }
const connectedUsers = new Map();

const defaultColors = [
  '#7c3aed','#06b6d4','#f59e0b','#ef4444','#10b981',
  '#ec4899','#8b5cf6','#14b8a6','#f97316','#6366f1',
  '#84cc16','#e11d48','#0ea5e9','#a855f7','#22d3ee'
];

function randomColor() {
  return defaultColors[Math.floor(Math.random() * defaultColors.length)];
}

function usersList() {
  const list = [];
  connectedUsers.forEach((u, id) => {
    list.push({ id, username: u.username, avatarEmoji: u.avatarEmoji, color: u.color, status: u.status });
  });
  return list;
}

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on('register', (username) => {
    const name = username.trim();
    if (!name) return;
    let taken = false;
    connectedUsers.forEach(u => { if (u.username.toLowerCase() === name.toLowerCase()) taken = true; });
    if (taken) return socket.emit('register_error', 'Nombre en uso. Elige otro.');

    const user = { username: name, avatarEmoji: '😀', color: randomColor(), status: 'En línea' };
    connectedUsers.set(socket.id, user);
    socket.emit('register_success', { id: socket.id, ...user });
    io.emit('users_update', usersList());
    io.emit('system_message', { text: `${name} se unió al chat`, timestamp: Date.now(), type: 'join' });
  });

  socket.on('update_profile', (data) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    if (data.avatarEmoji) user.avatarEmoji = data.avatarEmoji;
    if (data.color) user.color = data.color;
    if (typeof data.status === 'string') user.status = data.status.slice(0, 50);
    connectedUsers.set(socket.id, user);
    socket.emit('profile_updated', { id: socket.id, ...user });
    io.emit('users_update', usersList());
  });

  socket.on('public_message', (data) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    io.emit('new_message', {
      id: Date.now() + '-' + socket.id,
      senderId: socket.id, senderName: user.username,
      senderEmoji: user.avatarEmoji, senderColor: user.color,
      text: data.text, timestamp: Date.now(), type: 'public'
    });
  });

  socket.on('private_message', (data) => {
    const sender = connectedUsers.get(socket.id);
    const target = connectedUsers.get(data.targetId);
    if (!sender || !target) return;
    const msg = {
      id: Date.now() + '-' + socket.id,
      senderId: socket.id, senderName: sender.username,
      senderEmoji: sender.avatarEmoji, senderColor: sender.color,
      targetId: data.targetId, targetName: target.username,
      text: data.text, timestamp: Date.now(), type: 'private'
    };
    io.to(data.targetId).emit('new_message', msg);
    socket.emit('new_message', msg);
  });

  socket.on('typing', (data) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    const payload = { userId: socket.id, username: user.username };
    if (data.targetId) io.to(data.targetId).emit('user_typing', payload);
    else socket.broadcast.emit('user_typing', payload);
  });

  socket.on('stop_typing', (data) => {
    if (data && data.targetId) io.to(data.targetId).emit('user_stop_typing', { userId: socket.id });
    else socket.broadcast.emit('user_stop_typing', { userId: socket.id });
  });

  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      connectedUsers.delete(socket.id);
      io.emit('users_update', usersList());
      io.emit('system_message', { text: `${user.username} salió del chat`, timestamp: Date.now(), type: 'leave' });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🚀 Temo Chat v2.0 → http://localhost:${PORT}\n`);
});
