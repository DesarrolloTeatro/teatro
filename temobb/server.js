const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Almacén de usuarios conectados: { socketId: { username, avatar, color } }
const connectedUsers = new Map();

// Colores de avatar predefinidos
const avatarColors = [
  '#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#10b981',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
  '#84cc16', '#e11d48', '#0ea5e9', '#a855f7', '#22d3ee'
];

function getRandomColor() {
  return avatarColors[Math.floor(Math.random() * avatarColors.length)];
}

function getConnectedUsersList() {
  const users = [];
  connectedUsers.forEach((user, socketId) => {
    users.push({ id: socketId, username: user.username, avatar: user.avatar, color: user.color });
  });
  return users;
}

io.on('connection', (socket) => {
  console.log(`[Conexión] Socket conectado: ${socket.id}`);

  // Registro de usuario
  socket.on('register', (username) => {
    const trimmedName = username.trim();
    if (!trimmedName) return;

    // Verificar si el nombre ya existe
    let nameTaken = false;
    connectedUsers.forEach((user) => {
      if (user.username.toLowerCase() === trimmedName.toLowerCase()) {
        nameTaken = true;
      }
    });

    if (nameTaken) {
      socket.emit('register_error', 'Este nombre de usuario ya está en uso. Elige otro.');
      return;
    }

    const userColor = getRandomColor();
    const userInfo = {
      username: trimmedName,
      avatar: trimmedName.charAt(0).toUpperCase(),
      color: userColor
    };

    connectedUsers.set(socket.id, userInfo);

    // Confirmar registro al usuario
    socket.emit('register_success', { id: socket.id, ...userInfo });

    // Notificar a todos los usuarios sobre la lista actualizada
    io.emit('users_update', getConnectedUsersList());

    // Mensaje de sistema: usuario se unió
    io.emit('system_message', {
      text: `${trimmedName} se unió al chat`,
      timestamp: new Date().toISOString(),
      type: 'join'
    });

    console.log(`[Registro] ${trimmedName} registrado (${socket.id})`);
  });

  // Mensaje público (a todos)
  socket.on('public_message', (data) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    const message = {
      id: Date.now() + '-' + socket.id,
      senderId: socket.id,
      senderName: user.username,
      senderAvatar: user.avatar,
      senderColor: user.color,
      text: data.text,
      timestamp: new Date().toISOString(),
      type: 'public'
    };

    io.emit('new_message', message);
  });

  // Mensaje privado
  socket.on('private_message', (data) => {
    const sender = connectedUsers.get(socket.id);
    if (!sender) return;

    const { targetId, text } = data;
    const target = connectedUsers.get(targetId);
    if (!target) return;

    const message = {
      id: Date.now() + '-' + socket.id,
      senderId: socket.id,
      senderName: sender.username,
      senderAvatar: sender.avatar,
      senderColor: sender.color,
      targetId: targetId,
      targetName: target.username,
      text: text,
      timestamp: new Date().toISOString(),
      type: 'private'
    };

    // Enviar al destinatario
    io.to(targetId).emit('new_message', message);
    // Enviar confirmación al emisor
    socket.emit('new_message', message);
  });

  // Indicador de escritura
  socket.on('typing', (data) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (data.targetId) {
      // Typing privado
      io.to(data.targetId).emit('user_typing', {
        userId: socket.id,
        username: user.username,
        isPrivate: true
      });
    } else {
      // Typing público
      socket.broadcast.emit('user_typing', {
        userId: socket.id,
        username: user.username,
        isPrivate: false
      });
    }
  });

  socket.on('stop_typing', (data) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (data && data.targetId) {
      io.to(data.targetId).emit('user_stop_typing', { userId: socket.id });
    } else {
      socket.broadcast.emit('user_stop_typing', { userId: socket.id });
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      connectedUsers.delete(socket.id);

      // Notificar a todos
      io.emit('users_update', getConnectedUsersList());
      io.emit('system_message', {
        text: `${user.username} salió del chat`,
        timestamp: new Date().toISOString(),
        type: 'leave'
      });

      console.log(`[Desconexión] ${user.username} desconectado (${socket.id})`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║   🚀 Temo Chat Server en puerto ${PORT}  ║`);
  console.log(`  ║   📡 http://localhost:${PORT}            ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
