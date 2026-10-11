/**
 * Chatbot AI - Client Application with Chat History & Multi-Session
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const chatForm = document.getElementById('chat-form');
  const promptInput = document.getElementById('prompt-input');
  const btnSend = document.getElementById('btn-send');
  const btnStop = document.getElementById('btn-stop');
  const messagesContainer = document.getElementById('messages-container');
  const messagesList = document.getElementById('messages-list');
  const welcomeScreen = document.getElementById('welcome-screen');
  const typingIndicator = document.getElementById('typing-indicator');
  const btnClearChat = document.getElementById('btn-clear-chat');
  const btnNewChat = document.getElementById('btn-new-chat');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const sidebar = document.getElementById('sidebar');
  const historyList = document.getElementById('history-list');
  const historyCount = document.getElementById('history-count');

  // File Upload Elements
  const btnAttach = document.getElementById('btn-attach');
  const attachMenu = document.getElementById('attach-menu');
  const optImage = document.getElementById('opt-image');
  const optDoc = document.getElementById('opt-doc');
  const optAudio = document.getElementById('opt-audio');
  const fileInputImage = document.getElementById('file-input-image');
  const fileInputDoc = document.getElementById('file-input-doc');
  const fileInputAudio = document.getElementById('file-input-audio');
  const attachmentPreview = document.getElementById('attachment-preview');
  const previewThumbBox = document.getElementById('preview-thumb-box');
  const previewIcon = document.getElementById('preview-icon');
  const previewName = document.getElementById('preview-name');
  const previewSize = document.getElementById('preview-size');
  const btnRemoveAttachment = document.getElementById('btn-remove-attachment');

  // Multi-Session Chat State
  const STORAGE_KEY = 'gemini_pixel_sessions';
  const ACTIVE_KEY = 'gemini_pixel_active_session';
  let sessions = [];
  let currentSessionId = null;
  let currentAttachment = null; // { file: File, type: 'image' | 'doc' | 'audio', previewUrl: string, base64?: string }
  let isGenerating = false;
  let currentAbortController = null;

  // Configure Marked with highlight.js
  if (window.marked && window.hljs) {
    marked.setOptions({
      highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true,
    });
  }

  // =========================================================================
  // Session & LocalStorage Management
  // =========================================================================
  function loadSessions() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      sessions = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(sessions)) sessions = [];
    } catch {
      sessions = [];
    }

    currentSessionId = localStorage.getItem(ACTIVE_KEY);

    if (sessions.length === 0) {
      createNewSession(false);
    } else {
      const exists = sessions.some((s) => s.id === currentSessionId);
      if (!exists) {
        currentSessionId = sessions[0].id;
      }
      saveSessions();
      renderHistoryList();
      renderActiveSessionMessages();
    }
  }

  function saveSessions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      if (currentSessionId) {
        localStorage.setItem(ACTIVE_KEY, currentSessionId);
      }
    } catch (e) {
      console.warn('LocalStorage quota or save error:', e);
    }
  }

  function getCurrentSession() {
    return sessions.find((s) => s.id === currentSessionId);
  }

  function createNewSession(switchImmediately = true) {
    const newSession = {
      id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: 'Obrolan Baru',
      timestamp: Date.now(),
      messages: [],
      conversationHistory: [],
    };

    sessions.unshift(newSession);
    currentSessionId = newSession.id;
    saveSessions();
    renderHistoryList();

    if (switchImmediately) {
      renderActiveSessionMessages();
      clearAttachment();
      promptInput.value = '';
      promptInput.style.height = 'auto';
      promptInput.focus();
    }
  }

  function switchSession(sessionId) {
    if (currentSessionId === sessionId) return;
    currentSessionId = sessionId;
    saveSessions();
    renderHistoryList();
    renderActiveSessionMessages();
    clearAttachment();
    promptInput.focus();

    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  }

  function deleteSession(sessionId, e) {
    if (e) e.stopPropagation();

    sessions = sessions.filter((s) => s.id !== sessionId);

    if (sessions.length === 0) {
      createNewSession(true);
      return;
    }

    if (currentSessionId === sessionId) {
      currentSessionId = sessions[0].id;
    }

    saveSessions();
    renderHistoryList();
    renderActiveSessionMessages();
  }

  function renderHistoryList() {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (historyCount) historyCount.textContent = sessions.length;

    if (sessions.length === 0) {
      historyList.innerHTML = `
        <div class="history-empty">
          <span class="history-empty-icon">🎮</span>
          <span class="history-empty-text">BELUM ADA RIWAYAT CHAT</span>
        </div>
      `;
      return;
    }

    sessions.forEach((session) => {
      const item = document.createElement('div');
      item.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
      
      const timeStr = formatHistoryTime(session.timestamp);

      item.innerHTML = `
        <div class="history-item-content">
          <span class="history-item-title">${escapeHtml(session.title || 'Obrolan Baru')}</span>
          <span class="history-item-meta">${timeStr} · ${session.messages ? session.messages.length : 0} pesan</span>
        </div>
        <button class="btn-delete-session" title="Hapus Percakapan ini">✕</button>
      `;

      item.addEventListener('click', () => switchSession(session.id));

      const delBtn = item.querySelector('.btn-delete-session');
      delBtn.addEventListener('click', (ev) => deleteSession(session.id, ev));

      historyList.appendChild(item);
    });
  }

  function formatHistoryTime(ts) {
    if (!ts) return 'Hari ini';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function renderActiveSessionMessages() {
    const session = getCurrentSession();
    messagesList.innerHTML = '';

    if (!session || !session.messages || session.messages.length === 0) {
      welcomeScreen.style.display = 'flex';
      return;
    }

    welcomeScreen.style.display = 'none';

    session.messages.forEach((msg, idx) => {
      if (msg.role === 'user') {
        renderUserMessageToDOM(msg.text, msg.attachment, msg.time, idx);
      } else {
        renderBotMessageToDOM(msg.text, msg.time);
      }
    });

    scrollToBottom();
  }

  // =========================================================================
  // UI Inputs & Controls
  // =========================================================================

  // Auto-resize textarea
  promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + 'px';
  });

  // Handle Enter key
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating) {
        chatForm.dispatchEvent(new Event('submit'));
      }
    }
  });

  // Attachment Menu Toggle
  btnAttach.addEventListener('click', (e) => {
    e.stopPropagation();
    attachMenu.classList.toggle('active');
  });

  document.addEventListener('click', () => {
    attachMenu.classList.remove('active');
  });

  attachMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Attachment Options
  optImage.addEventListener('click', () => {
    fileInputImage.click();
    attachMenu.classList.remove('active');
  });

  optDoc.addEventListener('click', () => {
    fileInputDoc.click();
    attachMenu.classList.remove('active');
  });

  optAudio.addEventListener('click', () => {
    fileInputAudio.click();
    attachMenu.classList.remove('active');
  });

  // File Input Changes
  fileInputImage.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelected(e.target.files[0], 'image');
  });

  fileInputDoc.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelected(e.target.files[0], 'doc');
  });

  fileInputAudio.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelected(e.target.files[0], 'audio');
  });

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function handleFileSelected(file, type) {
    let previewUrl = null;

    if (type === 'image') {
      previewUrl = URL.createObjectURL(file);
      if (previewThumbBox) {
        previewThumbBox.innerHTML = `<img src="${previewUrl}" class="preview-img-thumb" alt="Thumbnail">`;
      }
    } else if (type === 'doc') {
      if (previewThumbBox) {
        previewThumbBox.innerHTML = `<span class="pill-icon"><i class="fa-solid fa-file-lines"></i></span>`;
      }
    } else if (type === 'audio') {
      if (previewThumbBox) {
        previewThumbBox.innerHTML = `<span class="pill-icon"><i class="fa-solid fa-microphone"></i></span>`;
      }
    }

    currentAttachment = {
      file,
      type,
      name: file.name,
      size: file.size,
      previewUrl,
    };

    previewName.textContent = file.name;
    previewSize.textContent = formatBytes(file.size);
    attachmentPreview.style.display = 'flex';
    promptInput.focus();
  }

  btnRemoveAttachment.addEventListener('click', clearAttachment);

  function clearAttachment() {
    if (currentAttachment && currentAttachment.previewUrl) {
      URL.revokeObjectURL(currentAttachment.previewUrl);
    }
    currentAttachment = null;
    attachmentPreview.style.display = 'none';
    if (previewThumbBox) {
      previewThumbBox.innerHTML = `<span class="pill-icon" id="preview-icon"><i class="fa-solid fa-paperclip"></i></span>`;
    }
    fileInputImage.value = '';
    fileInputDoc.value = '';
    fileInputAudio.value = '';
  }

  // Drag and Drop files
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleFileSelected(file, 'image');
      } else if (file.type.startsWith('audio/')) {
        handleFileSelected(file, 'audio');
      } else {
        handleFileSelected(file, 'doc');
      }
    }
  });

  // Toggle & Close Sidebar (Support both Desktop and Mobile, like ChatGPT & Gemini)
  function toggleSidebar() {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('open');
    } else {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('gemini_pixel_sidebar_collapsed', sidebar.classList.contains('collapsed'));
    }
  }

  function closeSidebar() {
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    } else {
      sidebar.classList.add('collapsed');
      localStorage.setItem('gemini_pixel_sidebar_collapsed', 'true');
    }
  }

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', toggleSidebar);
  }
  if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', closeSidebar);
  }

  // Restore collapsed state on desktop
  if (window.innerWidth > 768 && localStorage.getItem('gemini_pixel_sidebar_collapsed') === 'true') {
    sidebar.classList.add('collapsed');
  }

  // Suggestion Cards Click
  document.querySelectorAll('.suggestion-card').forEach((card) => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      promptInput.value = prompt;
      promptInput.dispatchEvent(new Event('input'));
      chatForm.dispatchEvent(new Event('submit'));
    });
  });

  // New Chat Button
  btnNewChat.addEventListener('click', () => {
    createNewSession(true);
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  });

  // Clear Current Chat
  btnClearChat.addEventListener('click', () => {
    const session = getCurrentSession();
    if (!session || (!session.messages || session.messages.length === 0)) return;

    if (confirm('Bersihkan percakapan ini?')) {
      session.messages = [];
      session.conversationHistory = [];
      session.title = 'Obrolan Baru';
      saveSessions();
      renderHistoryList();
      renderActiveSessionMessages();
    }
  });

  // =========================================================================
  // Send Message & Backend Communication
  // =========================================================================
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const text = promptInput.value.trim();
    if (!text && !currentAttachment) return;
    if (isGenerating) return;

    let session = getCurrentSession();
    if (!session) {
      createNewSession(false);
      session = getCurrentSession();
    }

    welcomeScreen.style.display = 'none';

    // Store reference to attachment and text
    const attached = currentAttachment;
    clearAttachment();

    // Reset input
    promptInput.value = '';
    promptInput.style.height = 'auto';

    const timeStr = getTimeString();

    // If first message, auto-title the session
    if (!session.messages || session.messages.length === 0 || session.title === 'Obrolan Baru') {
      session.title = text ? (text.length > 25 ? text.substring(0, 25) + '...' : text) : (attached ? attached.name : 'Percakapan');
    }

    // Prepare attachment metadata for session storage
    const attachmentMeta = attached ? {
      type: attached.type,
      name: attached.name,
      size: attached.size,
      previewUrl: attached.type === 'image' ? attached.previewUrl : null,
    } : null;

    // Append to session state
    if (!session.messages) session.messages = [];
    session.messages.push({
      role: 'user',
      text,
      attachment: attachmentMeta,
      time: timeStr,
    });

    saveSessions();
    renderHistoryList();

    // Render User Message to DOM
    renderUserMessageToDOM(text, attachmentMeta, timeStr, session.messages.length - 1);
    scrollToBottom();

    // Set Loading State with AbortController
    currentAbortController = new AbortController();
    setLoading(true);

    let streamingUI = null;
    let botText = '';

    try {
      let botResponse = '';

      if (attached) {
        // Send to Multimodal endpoints
        const formData = new FormData();
        formData.append('prompt', text || 'Analisis dan jelaskan berkas terlampir ini');

        let endpoint = '/generate-text';
        if (attached.type === 'image') {
          endpoint = '/generate-from-image';
          formData.append('image', attached.file);
        } else if (attached.type === 'doc') {
          endpoint = '/generate-from-document';
          formData.append('document', attached.file);
        } else if (attached.type === 'audio') {
          endpoint = '/generate-from-audio';
          formData.append('audio', attached.file);
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          signal: currentAbortController.signal,
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Terjadi kesalahan saat memproses file');
        }

        botResponse = data.result || 'Tidak ada teks yang dihasilkan.';
        
        // Push user and model to conversation history
        const userPromptWithContext = `[File terlampir: ${attached.name}] ${text}`;
        if (!session.conversationHistory) session.conversationHistory = [];
        session.conversationHistory.push({ role: 'user', text: userPromptWithContext });
        session.conversationHistory.push({ role: 'model', text: botResponse });

        const botTime = getTimeString();
        session.messages.push({
          role: 'bot',
          text: botResponse,
          time: botTime,
        });

        saveSessions();
        renderHistoryList();
        renderBotMessageToDOM(botResponse, botTime);
      } else {
        // Streaming Real-time SSE (< 1 detik mulai ketik)
        if (!session.conversationHistory) session.conversationHistory = [];

        const res = await fetch('/chat-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            history: session.conversationHistory,
            message: text,
          }),
          signal: currentAbortController.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Gagal menghubungi Gemini API');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop();

          for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === '[DONE]') break;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                if (parsed.text) {
                  if (!streamingUI) {
                    typingIndicator.style.display = 'none';
                    streamingUI = createStreamingBotRow();
                  }
                  botText += parsed.text;
                  updateStreamingBubble(streamingUI.bubble, botText);
                  scrollToBottom();
                }
              } catch (e) {
                if (e.message && !e.message.includes('JSON')) throw e;
              }
            }
          }
        }

        botResponse = botText;
        const botTime = getTimeString();

        if (streamingUI) {
          finalizeStreamingBubble(streamingUI.row, botResponse);
        } else {
          renderBotMessageToDOM(botResponse || 'Tidak ada respons.', botTime);
        }

        session.conversationHistory.push({ role: 'user', text });
        session.conversationHistory.push({ role: 'model', text: botResponse });

        session.messages.push({
          role: 'bot',
          text: botResponse,
          time: botTime,
        });

        saveSessions();
        renderHistoryList();
      }
    } catch (err) {
      if (err.name === 'AbortError' || currentAbortController?.signal?.aborted) {
        // Handled gracefully when user clicks Stop
        const botTime = getTimeString();
        const partialOrCancelledText = botText 
          ? `${botText}\n\n*(Dihentikan)*` 
          : '*(Respon dihentikan oleh pengguna)*';

        if (streamingUI) {
          finalizeStreamingBubble(streamingUI.row, partialOrCancelledText);
        } else {
          renderBotMessageToDOM(partialOrCancelledText, botTime);
        }

        session.messages.push({
          role: 'bot',
          text: partialOrCancelledText,
          time: botTime,
        });
        if (botText) {
          session.conversationHistory.push({ role: 'user', text });
          session.conversationHistory.push({ role: 'model', text: botText });
        }
        saveSessions();
        renderHistoryList();
      } else {
        const errText = `⚠️ **Error**: ${err.message || 'Gagal terhubung ke server backend'}`;
        const errTime = getTimeString();
        session.messages.push({
          role: 'bot',
          text: errText,
          time: errTime,
        });
        saveSessions();
        renderBotMessageToDOM(errText, errTime);
      }
    } finally {
      setLoading(false);
      scrollToBottom();
      promptInput.focus();
    }
  });

  // Stop generation button click
  if (btnStop) {
    btnStop.addEventListener('click', () => {
      if (currentAbortController) {
        currentAbortController.abort();
      }
    });
  }

  function setLoading(loading) {
    isGenerating = loading;
    if (loading) {
      btnSend.style.display = 'none';
      if (btnStop) btnStop.style.display = 'flex';
      typingIndicator.style.display = 'flex';
    } else {
      btnSend.style.display = 'flex';
      btnSend.disabled = false;
      if (btnStop) btnStop.style.display = 'none';
      typingIndicator.style.display = 'none';
      currentAbortController = null;
    }
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // =========================================================================
  // DOM Message Rendering
  // =========================================================================
  function renderUserMessageToDOM(text, attachment, timeStr, msgIndex) {
    const row = document.createElement('div');
    row.className = 'message-row user';
    if (msgIndex !== undefined) row.dataset.msgIndex = msgIndex;

    let attachmentHtml = '';
    if (attachment) {
      if (attachment.type === 'image' && attachment.previewUrl) {
        attachmentHtml = `
          <div class="bubble-attachment">
            <img src="${attachment.previewUrl}" alt="Attached image preview">
            <div class="att-info">
              <span class="att-name">${escapeHtml(attachment.name)}</span>
              <span class="att-size">${formatBytes(attachment.size)}</span>
            </div>
          </div>
        `;
      } else {
        const iconClass = attachment.type === 'audio' ? 'fa-microphone' : 'fa-file-lines';
        attachmentHtml = `
          <div class="bubble-attachment">
            <span class="bubble-att-icon"><i class="fa-solid ${iconClass}"></i></span>
            <div class="att-info">
              <span class="att-name">${escapeHtml(attachment.name)}</span>
              <span class="att-size">${formatBytes(attachment.size)}</span>
            </div>
          </div>
        `;
      }
    }

    row.innerHTML = `
      <div class="avatar user-avatar" title="User"><i class="fa-solid fa-user"></i></div>
      <div class="message-content">
        <div class="message-bubble user-bubble">
          ${attachmentHtml}
          ${text ? `<div class="message-text-content"><p style="margin: 0; white-space: pre-wrap;">${escapeHtml(text)}</p></div>` : ''}
        </div>
        <div class="message-meta-row">
          <div class="message-actions user-actions">
            <button class="btn-msg-action btn-copy-msg" title="Salin Pertanyaan">
              <i class="fa-regular fa-copy"></i>
            </button>
            ${text ? `
            <button class="btn-msg-action btn-edit-msg" title="Edit Pertanyaan">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>` : ''}
          </div>
          <span class="message-time">${timeStr || getTimeString()}</span>
        </div>
      </div>
    `;

    // Hook up copy button
    const copyBtn = row.querySelector('.btn-copy-msg');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(text || (attachment ? attachment.name : ''));
          copyBtn.innerHTML = `<i class="fa-solid fa-check" style="color: #16a34a;"></i>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`;
          }, 1800);
        } catch (e) {
          console.error(e);
        }
      });
    }

    // Hook up edit button
    const editBtn = row.querySelector('.btn-edit-msg');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        if (isGenerating) return;
        startInlineEdit(row, text, msgIndex);
      });
    }

    messagesList.appendChild(row);
  }

  function startInlineEdit(row, originalText, msgIndex) {
    const bubble = row.querySelector('.message-bubble');
    const metaRow = row.querySelector('.message-meta-row');
    if (!bubble) return;

    const previousBubbleHtml = bubble.innerHTML;
    if (metaRow) metaRow.style.display = 'none';

    bubble.innerHTML = `
      <div class="inline-edit-wrapper">
        <textarea class="inline-edit-textarea" rows="3">${escapeHtml(originalText)}</textarea>
        <div class="inline-edit-actions">
          <button type="button" class="btn-edit-cancel">Batal</button>
          <button type="button" class="btn-edit-submit">
            <i class="fa-solid fa-paper-plane"></i> Kirim Ulang
          </button>
        </div>
      </div>
    `;

    const textarea = bubble.querySelector('.inline-edit-textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Cancel
    const cancelBtn = bubble.querySelector('.btn-edit-cancel');
    cancelBtn.addEventListener('click', () => {
      bubble.innerHTML = previousBubbleHtml;
      if (metaRow) metaRow.style.display = 'flex';
    });

    // Load to bottom input
    const loadBtn = bubble.querySelector('.btn-edit-load');
    loadBtn.addEventListener('click', () => {
      promptInput.value = textarea.value;
      promptInput.style.height = 'auto';
      promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + 'px';
      promptInput.focus();
      bubble.innerHTML = previousBubbleHtml;
      if (metaRow) metaRow.style.display = 'flex';
      scrollToBottom();
    });

    // Submit
    const submitBtn = bubble.querySelector('.btn-edit-submit');
    const doSubmit = () => {
      const newText = textarea.value.trim();
      if (!newText) return;
      resubmitEditedQuestion(msgIndex, newText);
    };

    submitBtn.addEventListener('click', doSubmit);

    // Keyboard shortcuts
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSubmit();
      } else if (e.key === 'Escape') {
        cancelBtn.click();
      }
    });
  }

  function resubmitEditedQuestion(msgIndex, newText) {
    if (isGenerating) return;
    const session = getCurrentSession();
    if (!session || !session.messages) return;

    let targetIndex = msgIndex;
    if (targetIndex === undefined || targetIndex === '' || targetIndex < 0) {
      targetIndex = session.messages.length - 1;
    }

    // Truncate messages to before this index
    session.messages = session.messages.slice(0, targetIndex);

    // Rebuild conversationHistory up to this point
    session.conversationHistory = [];
    session.messages.forEach((msg) => {
      if (msg.role === 'user') {
        const attachTxt = msg.attachment ? `[File terlampir: ${msg.attachment.name}] ` : '';
        session.conversationHistory.push({ role: 'user', text: attachTxt + msg.text });
      } else if (msg.role === 'bot') {
        session.conversationHistory.push({ role: 'model', text: msg.text });
      }
    });

    saveSessions();
    renderHistoryList();
    renderActiveSessionMessages();

    // Set newText in prompt input and submit form
    promptInput.value = newText;
    promptInput.style.height = 'auto';
    chatForm.dispatchEvent(new Event('submit'));
  }

  function createStreamingBotRow() {
    const row = document.createElement('div');
    row.className = 'message-row bot';
    row.innerHTML = `
      <div class="avatar bot-avatar" title="Chatbot AI"><i class="fa-solid fa-robot"></i></div>
      <div class="message-content">
        <div class="message-bubble">
          <span class="streaming-cursor">▊</span>
        </div>
        <div class="message-meta-row">
          <div class="message-actions bot-actions" style="display: none;">
            <button class="btn-msg-action btn-copy-msg" title="Salin Jawaban">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
          <span class="message-time">${getTimeString()}</span>
        </div>
      </div>
    `;
    messagesList.appendChild(row);
    return {
      row,
      bubble: row.querySelector('.message-bubble'),
      timeEl: row.querySelector('.message-time'),
      actionsEl: row.querySelector('.bot-actions'),
    };
  }

  function updateStreamingBubble(bubble, markdownText) {
    let renderedHtml = '';
    try {
      renderedHtml = window.marked ? marked.parse(markdownText) : escapeHtml(markdownText);
    } catch {
      renderedHtml = escapeHtml(markdownText);
    }
    bubble.innerHTML = renderedHtml + '<span class="streaming-cursor">▊</span>';
  }

  function finalizeStreamingBubble(row, markdownText) {
    const bubble = row.querySelector('.message-bubble');
    let renderedHtml = '';
    try {
      renderedHtml = window.marked ? marked.parse(markdownText) : escapeHtml(markdownText);
    } catch {
      renderedHtml = escapeHtml(markdownText);
    }
    bubble.innerHTML = renderedHtml;
    attachCodeCopyButtons(row);

    // Show bot copy action button
    const actionsEl = row.querySelector('.bot-actions');
    if (actionsEl) {
      actionsEl.style.display = 'flex';
      const copyBtn = actionsEl.querySelector('.btn-copy-msg');
      if (copyBtn) {
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(markdownText);
            copyBtn.innerHTML = `<i class="fa-solid fa-check" style="color: #16a34a;"></i>`;
            setTimeout(() => {
              copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`;
            }, 1800);
          } catch (e) {
            console.error(e);
          }
        };
      }
    }
  }

  function attachCodeCopyButtons(container) {
    const codeBlocks = container.querySelectorAll('pre');
    codeBlocks.forEach((pre) => {
      if (pre.parentElement && pre.parentElement.classList.contains('code-wrapper')) return;

      const codeElement = pre.querySelector('code');
      const codeText = codeElement ? codeElement.innerText : pre.innerText;

      const wrapper = document.createElement('div');
      wrapper.className = 'code-wrapper';

      const header = document.createElement('div');
      header.className = 'code-header';

      let lang = 'CODE';
      if (codeElement) {
        const classList = Array.from(codeElement.classList);
        const langClass = classList.find((c) => c.startsWith('language-'));
        if (langClass) lang = langClass.replace('language-', '').toUpperCase();
      }

      header.innerHTML = `
        <span>[ ${lang} ]</span>
        <button class="code-copy-btn">
          <i class="fa-regular fa-copy"></i>
          SALIN
        </button>
      `;

      const copyBtn = header.querySelector('.code-copy-btn');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(codeText);
          copyBtn.innerHTML = `<i class="fa-solid fa-check" style="color: #16a34a;"></i> TERSALIN!`;
          setTimeout(() => {
            copyBtn.innerHTML = `
              <i class="fa-regular fa-copy"></i>
              SALIN
            `;
          }, 2000);
        } catch (e) {
          console.error(e);
        }
      });

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });
  }

  function renderBotMessageToDOM(markdownText, timeStr) {
    const row = document.createElement('div');
    row.className = 'message-row bot';

    let renderedHtml = '';
    try {
      renderedHtml = window.marked ? marked.parse(markdownText) : escapeHtml(markdownText);
    } catch {
      renderedHtml = escapeHtml(markdownText);
    }

    row.innerHTML = `
      <div class="avatar bot-avatar" title="Chatbot AI"><i class="fa-solid fa-robot"></i></div>
      <div class="message-content">
        <div class="message-bubble">
          ${renderedHtml}
        </div>
        <div class="message-meta-row">
          <div class="message-actions bot-actions">
            <button class="btn-msg-action btn-copy-msg" title="Salin Jawaban">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
          <span class="message-time">${timeStr || getTimeString()}</span>
        </div>
      </div>
    `;

    // Hook up copy button
    const copyBtn = row.querySelector('.btn-copy-msg');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(markdownText);
          copyBtn.innerHTML = `<i class="fa-solid fa-check" style="color: #16a34a;"></i>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`;
          }, 1800);
        } catch (e) {
          console.error(e);
        }
      });
    }

    attachCodeCopyButtons(row);
    messagesList.appendChild(row);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize
  loadSessions();
});
