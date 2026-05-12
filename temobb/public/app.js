// ========== Temo Chat - Client App ==========
const socket = io();

// === DOM Elements ===
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const sidebar = document.getElementById('sidebar');
const sidebarToggleOpen = document.getElementById('sidebar-toggle-open');
const sidebarToggleClose = document.getElementById('sidebar-toggle-close');
const channelGeneral = document.getElementById('channel-general');
const usersList = document.getElementById('users-list');
const onlineCount = document.getElementById('online-count');
const chatChannelName = document.getElementById('chat-channel-name');
const chatChannelDesc = document.getElementById('chat-channel-desc');
const myAvatar = document.getElementById('my-avatar');
const myUsername = document.getElementById('my-username');
const messagesContainer = document.getElementById('messages-container');
const messagesList = document.getElementById('messages-list');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const privateTag = document.getElementById('private-tag');
const privateTagName = document.getElementById('private-tag-name');
const cancelPrivate = document.getElementById('cancel-private');
const typingIndicator = document.getElementById('typing-indicator');
const typingText = document.getElementById('typing-text');
const generalBadge = document.getElementById('general-badge');

// === State ===
let currentUser = null;
let activeChat = { type: 'general', targetId: null, targetName: null };
let allMessages = { general: [] }; // { general: [...], odid: [...] }
let unreadCounts = {}; // { odid: number }
let typingTimers = {};
let myTypingTimer = null;

// === Login ===
usernameInput.addEventListener('input', () => {
  loginBtn.disabled = !usernameInput.value.trim();
  loginError.style.display = 'none';
});
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !loginBtn.disabled) doLogin();
});
loginBtn.addEventListener('click', doLogin);

function doLogin() {
  const name = usernameInput.value.trim();
  if (!name) return;
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span>Conectando...</span>';
  socket.emit('register', name);
}

socket.on('register_success', (user) => {
  currentUser = user;
  loginScreen.style.display = 'none';
  chatScreen.style.display = 'flex';
  myAvatar.textContent = user.avatar;
  myAvatar.style.background = user.color;
  myUsername.textContent = user.username;
  messageInput.focus();
});

socket.on('register_error', (msg) => {
  loginError.textContent = msg;
  loginError.style.display = 'block';
  loginBtn.disabled = false;
  loginBtn.innerHTML = '<span>Unirse al Chat</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
});

// === Sidebar toggle (mobile) ===
sidebarToggleOpen.addEventListener('click', () => sidebar.classList.add('open'));
sidebarToggleClose.addEventListener('click', () => sidebar.classList.remove('open'));

// === Users List ===
socket.on('users_update', (users) => {
  onlineCount.textContent = users.length;
  usersList.innerHTML = '';
  users.forEach((user) => {
    const li = document.createElement('li');
    li.className = 'user-item' + (user.id === currentUser?.id ? ' is-me' : '') +
      (activeChat.type === 'private' && activeChat.targetId === user.id ? ' active' : '');
    li.dataset.userId = user.id;

    const unread = unreadCounts[user.id] || 0;
    li.innerHTML = `
      <div class="user-avatar" style="background:${user.color}">
        ${user.avatar}
        <span class="online-dot"></span>
      </div>
      <span class="user-name">${escapeHtml(user.username)}</span>
      ${user.id === currentUser?.id ? '<span class="user-you">(tú)</span>' : ''}
      ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
    `;

    if (user.id !== currentUser?.id) {
      li.addEventListener('click', () => openPrivateChat(user.id, user.username));
    }
    usersList.appendChild(li);
  });
});

// === Channel switching ===
channelGeneral.addEventListener('click', () => openGeneralChat());

function openGeneralChat() {
  activeChat = { type: 'general', targetId: null, targetName: null };
  chatChannelName.textContent = '# General';
  chatChannelDesc.textContent = 'Todos los usuarios';
  channelGeneral.classList.add('active');
  privateTag.style.display = 'none';
  generalBadge.style.display = 'none';
  unreadCounts['general'] = 0;
  document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
  renderMessages();
  messageInput.placeholder = 'Escribe un mensaje...';
  messageInput.focus();
  sidebar.classList.remove('open');
}

function openPrivateChat(userId, username) {
  activeChat = { type: 'private', targetId: userId, targetName: username };
  chatChannelName.textContent = username;
  chatChannelDesc.textContent = 'Mensaje privado';
  channelGeneral.classList.remove('active');
  privateTag.style.display = 'flex';
  privateTagName.textContent = '🔒 ' + username;
  // Clear unread for this user
  unreadCounts[userId] = 0;
  // Update user list highlighting
  document.querySelectorAll('.user-item').forEach(el => {
    el.classList.toggle('active', el.dataset.userId === userId);
    if (el.dataset.userId === userId) {
      const badge = el.querySelector('.unread-badge');
      if (badge) badge.remove();
    }
  });
  if (!allMessages[userId]) allMessages[userId] = [];
  renderMessages();
  messageInput.placeholder = `Mensaje privado a ${username}...`;
  messageInput.focus();
  sidebar.classList.remove('open');
}

cancelPrivate.addEventListener('click', openGeneralChat);

// === Messages ===
socket.on('new_message', (msg) => {
  if (msg.type === 'public') {
    if (!allMessages['general']) allMessages['general'] = [];
    allMessages['general'].push(msg);
    if (activeChat.type === 'general') {
      appendMessage(msg);
    } else {
      unreadCounts['general'] = (unreadCounts['general'] || 0) + 1;
      generalBadge.textContent = unreadCounts['general'];
      generalBadge.style.display = 'inline';
    }
  } else if (msg.type === 'private') {
    const partnerId = msg.senderId === currentUser.id ? msg.targetId : msg.senderId;
    if (!allMessages[partnerId]) allMessages[partnerId] = [];
    allMessages[partnerId].push(msg);
    if (activeChat.type === 'private' && activeChat.targetId === partnerId) {
      appendMessage(msg);
    } else {
      unreadCounts[partnerId] = (unreadCounts[partnerId] || 0) + 1;
      // Update badge in user list
      const userItem = document.querySelector(`.user-item[data-user-id="${partnerId}"]`);
      if (userItem) {
        let badge = userItem.querySelector('.unread-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'unread-badge';
          userItem.appendChild(badge);
        }
        badge.textContent = unreadCounts[partnerId];
      }
    }
  }
});

socket.on('system_message', (msg) => {
  const icon = msg.type === 'join' ? '🟢' : '🔴';
  const div = document.createElement('div');
  div.className = 'system-message';
  div.innerHTML = `<span class="sys-icon">${icon}</span> ${escapeHtml(msg.text)}`;
  messagesList.appendChild(div);
  scrollToBottom();
});

function renderMessages() {
  // Clear all except welcome
  messagesList.innerHTML = '';
  const key = activeChat.type === 'general' ? 'general' : activeChat.targetId;
  const msgs = allMessages[key] || [];
  if (msgs.length === 0) {
    const welcome = document.createElement('div');
    welcome.className = 'welcome-message';
    if (activeChat.type === 'general') {
      welcome.innerHTML = `
        <div class="welcome-icon"><svg viewBox="0 0 64 64" fill="none"><defs><linearGradient id="wg" x1="0" y1="0" x2="64" y2="64"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs>
        <rect x="6" y="12" width="52" height="34" rx="8" stroke="url(#wg)" stroke-width="2" fill="none"/>
        <circle cx="22" cy="29" r="4" fill="url(#wg)" opacity=".6"/><circle cx="32" cy="29" r="4" fill="url(#wg)" opacity=".6"/><circle cx="42" cy="29" r="4" fill="url(#wg)" opacity=".6"/></svg></div>
        <h3>Bienvenido al chat</h3>
        <p>Envía mensajes a todos o haz clic en un usuario para un mensaje privado.</p>`;
    } else {
      welcome.innerHTML = `
        <h3>Chat privado con ${escapeHtml(activeChat.targetName)}</h3>
        <p>Los mensajes aquí solo son visibles entre tú y ${escapeHtml(activeChat.targetName)}.</p>`;
    }
    messagesList.appendChild(welcome);
  } else {
    msgs.forEach(msg => appendMessage(msg, false));
  }
  scrollToBottom();
}

function appendMessage(msg, scroll = true) {
  const isOwn = msg.senderId === currentUser.id;
  const row = document.createElement('div');
  row.className = 'message-row' + (isOwn ? ' own' : '') + (msg.type === 'private' ? ' private' : '');

  const time = new Date(msg.timestamp);
  const timeStr = time.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const privateLabel = msg.type === 'private'
    ? `<span class="message-private-label">${isOwn ? 'Para ' + escapeHtml(msg.targetName) : 'Privado'}</span>`
    : '';

  row.innerHTML = `
    <div class="message-avatar">
      <div class="user-avatar" style="background:${msg.senderColor}">${msg.senderAvatar}</div>
    </div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-sender" style="color:${msg.senderColor}">${escapeHtml(msg.senderName)}</span>
        ${privateLabel}
        <span class="message-time">${timeStr}</span>
      </div>
      <div class="message-bubble">${escapeHtml(msg.text)}</div>
    </div>
  `;

  // Remove welcome message if present
  const welcome = messagesList.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  messagesList.appendChild(row);
  if (scroll) scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// === Sending messages ===
messageInput.addEventListener('input', () => {
  sendBtn.disabled = !messageInput.value.trim();
  autoResize();
  // Typing indicator
  if (messageInput.value.trim()) {
    socket.emit('typing', { targetId: activeChat.targetId });
    clearTimeout(myTypingTimer);
    myTypingTimer = setTimeout(() => {
      socket.emit('stop_typing', { targetId: activeChat.targetId });
    }, 1500);
  } else {
    socket.emit('stop_typing', { targetId: activeChat.targetId });
  }
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.addEventListener('click', sendMessage);

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  if (activeChat.type === 'private' && activeChat.targetId) {
    socket.emit('private_message', { targetId: activeChat.targetId, text });
  } else {
    socket.emit('public_message', { text });
  }

  messageInput.value = '';
  sendBtn.disabled = true;
  autoResize();
  socket.emit('stop_typing', { targetId: activeChat.targetId });
  messageInput.focus();
}

function autoResize() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

// === Typing indicators ===
socket.on('user_typing', (data) => {
  typingTimers[data.userId] = true;
  updateTypingDisplay();
  clearTimeout(typingTimers[data.userId + '_timer']);
  typingTimers[data.userId + '_timer'] = setTimeout(() => {
    delete typingTimers[data.userId];
    updateTypingDisplay();
  }, 2000);
});

socket.on('user_stop_typing', (data) => {
  delete typingTimers[data.userId];
  clearTimeout(typingTimers[data.userId + '_timer']);
  updateTypingDisplay();
});

function updateTypingDisplay() {
  const typingUsers = Object.keys(typingTimers).filter(k => !k.includes('_timer') && typingTimers[k]);
  if (typingUsers.length === 0) {
    typingIndicator.style.display = 'none';
  } else {
    typingIndicator.style.display = 'flex';
    // Get usernames from user list
    const names = [];
    typingUsers.forEach(uid => {
      const el = document.querySelector(`.user-item[data-user-id="${uid}"] .user-name`);
      if (el) names.push(el.textContent);
    });
    if (names.length === 1) {
      typingText.textContent = `${names[0]} está escribiendo...`;
    } else if (names.length > 1) {
      typingText.textContent = `${names.join(', ')} están escribiendo...`;
    }
  }
}

// === Helpers ===
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
