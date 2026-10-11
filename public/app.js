/**
 * Chatbot AI - Client Application with Chat History & Multi-Session
 * Compact, modular, and full-featured
 */
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // DOM Elements
  const chatForm = $('chat-form');
  const promptInput = $('prompt-input');
  const btnSend = $('btn-send');
  const btnStop = $('btn-stop');
  const messagesContainer = $('messages-container');
  const messagesList = $('messages-list');
  const welcomeScreen = $('welcome-screen');
  const typingIndicator = $('typing-indicator');
  const btnClearChat = $('btn-clear-chat');
  const btnNewChat = $('btn-new-chat');
  const btnToggleSidebar = $('btn-toggle-sidebar');
  const btnCloseSidebar = $('btn-close-sidebar');
  const sidebar = $('sidebar');
  const historyList = $('history-list');
  const historyCount = $('history-count');

  // File Upload Elements
  const btnAttach = $('btn-attach');
  const attachMenu = $('attach-menu');
  const fileInputs = {
    image: $('file-input-image'),
    doc: $('file-input-doc'),
    audio: $('file-input-audio'),
  };
  const attachmentPreview = $('attachment-preview');
  const previewThumbBox = $('preview-thumb-box');
  const previewName = $('preview-name');
  const previewSize = $('preview-size');
  const btnRemoveAttachment = $('btn-remove-attachment');

  // State
  const STORAGE_KEY = 'gemini_pixel_sessions';
  const ACTIVE_KEY = 'gemini_pixel_active_session';
  let sessions = [];
  let currentSessionId = null;
  let currentAttachment = null;
  let isGenerating = false;
  let abortController = null;

  // Configure Marked
  if (window.marked && window.hljs) {
    marked.setOptions({
      highlight: (code, lang) => (lang && hljs.getLanguage(lang))
        ? hljs.highlight(code, { language: lang }).value
        : hljs.highlightAuto(code).value,
      breaks: true,
      gfm: true,
    });
  }

  // --- Helpers ---
  const escapeHtml = (str) => (str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);

  const getTimeStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatBytes = (b = 0) => {
    if (!b) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
  };

  const renderMarkdown = (text) => {
    try {
      return window.marked ? marked.parse(text) : escapeHtml(text);
    } catch {
      return escapeHtml(text);
    }
  };

  const copyToClipboard = async (text, btn, successLabel) => {
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.innerHTML;
      btn.innerHTML = `<i class="fa-solid fa-check" style="color:#16a34a"></i> ${successLabel || ''}`;
      setTimeout(() => (btn.innerHTML = original), 1800);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const scrollToBottom = () => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  };

  const setLoading = (loading) => {
    isGenerating = loading;
    btnSend.style.display = loading ? 'none' : 'flex';
    if (btnStop) btnStop.style.display = loading ? 'flex' : 'none';
    typingIndicator.style.display = loading ? 'flex' : 'none';
    if (!loading) abortController = null;
  };

  // --- Session Management ---
  const getCurrentSession = () => sessions.find((s) => s.id === currentSessionId);

  const saveSessions = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      if (currentSessionId) localStorage.setItem(ACTIVE_KEY, currentSessionId);
    } catch (e) {
      console.warn('Storage error:', e);
    }
  };

  const createNewSession = (switchNow = true) => {
    const s = {
      id: 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: 'Obrolan Baru',
      timestamp: Date.now(),
      messages: [],
      conversationHistory: [],
    };
    sessions.unshift(s);
    currentSessionId = s.id;
    saveSessions();
    renderHistory();
    if (switchNow) {
      renderActiveMessages();
      clearAttachment();
      promptInput.value = '';
      promptInput.style.height = 'auto';
      promptInput.focus();
    }
  };

  const switchSession = (id) => {
    if (currentSessionId === id) return;
    currentSessionId = id;
    saveSessions();
    renderHistory();
    renderActiveMessages();
    clearAttachment();
    promptInput.focus();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  };

  const deleteSession = (id, e) => {
    if (e) e.stopPropagation();
    sessions = sessions.filter((s) => s.id !== id);
    if (!sessions.length) return createNewSession(true);
    if (currentSessionId === id) currentSessionId = sessions[0].id;
    saveSessions();
    renderHistory();
    renderActiveMessages();
  };

  const renderHistory = () => {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (historyCount) historyCount.textContent = sessions.length;

    if (!sessions.length) {
      historyList.innerHTML = `<div class="history-empty"><span class="history-empty-icon">🎮</span><span class="history-empty-text">BELUM ADA RIWAYAT CHAT</span></div>`;
      return;
    }

    sessions.forEach((s) => {
      const item = document.createElement('div');
      item.className = `history-item ${s.id === currentSessionId ? 'active' : ''}`;
      const d = s.timestamp ? new Date(s.timestamp) : new Date();
      const timeStr = d.toDateString() === new Date().toDateString()
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });

      item.innerHTML = `
        <div class="history-item-content">
          <span class="history-item-title">${escapeHtml(s.title || 'Obrolan Baru')}</span>
          <span class="history-item-meta">${timeStr} · ${(s.messages || []).length} pesan</span>
        </div>
        <button class="btn-delete-session" title="Hapus Percakapan">✕</button>
      `;
      item.onclick = () => switchSession(s.id);
      item.querySelector('.btn-delete-session').onclick = (ev) => deleteSession(s.id, ev);
      historyList.appendChild(item);
    });
  };

  const loadSessions = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      sessions = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(sessions)) sessions = [];
    } catch {
      sessions = [];
    }
    currentSessionId = localStorage.getItem(ACTIVE_KEY);
    if (!sessions.length) {
      createNewSession(false);
    } else {
      if (!sessions.some((s) => s.id === currentSessionId)) currentSessionId = sessions[0].id;
      saveSessions();
      renderHistory();
      renderActiveMessages();
    }
  };

  // --- Attachments & Drag-and-Drop ---
  const handleFile = (file, type) => {
    const previewUrl = type === 'image' ? URL.createObjectURL(file) : null;
    if (previewThumbBox) {
      if (type === 'image') previewThumbBox.innerHTML = `<img src="${previewUrl}" class="preview-img-thumb" alt="Thumbnail">`;
      else previewThumbBox.innerHTML = `<span class="pill-icon"><i class="fa-solid ${type === 'audio' ? 'fa-microphone' : 'fa-file-lines'}"></i></span>`;
    }
    currentAttachment = { file, type, name: file.name, size: file.size, previewUrl };
    previewName.textContent = file.name;
    previewSize.textContent = formatBytes(file.size);
    attachmentPreview.style.display = 'flex';
    promptInput.focus();
  };

  const clearAttachment = () => {
    if (currentAttachment?.previewUrl) URL.revokeObjectURL(currentAttachment.previewUrl);
    currentAttachment = null;
    attachmentPreview.style.display = 'none';
    if (previewThumbBox) previewThumbBox.innerHTML = `<span class="pill-icon" id="preview-icon"><i class="fa-solid fa-paperclip"></i></span>`;
    Object.values(fileInputs).forEach((i) => i && (i.value = ''));
  };

  btnAttach?.addEventListener('click', (e) => {
    e.stopPropagation();
    attachMenu.classList.toggle('active');
  });
  document.addEventListener('click', () => attachMenu?.classList.remove('active'));
  attachMenu?.addEventListener('click', (e) => e.stopPropagation());

  const pickTypes = { 'opt-image': 'image', 'opt-doc': 'doc', 'opt-audio': 'audio' };
  Object.entries(pickTypes).forEach(([btnId, type]) => {
    $(btnId)?.addEventListener('click', () => {
      fileInputs[type]?.click();
      attachMenu.classList.remove('active');
    });
    fileInputs[type]?.addEventListener('change', (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0], type);
    });
  });

  btnRemoveAttachment?.addEventListener('click', clearAttachment);

  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const type = f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'audio' : 'doc';
    handleFile(f, type);
  });

  // --- Code Copy Enhancement ---
  const enhanceCodeBlocks = (container) => {
    container.querySelectorAll('pre').forEach((pre) => {
      if (pre.parentElement?.classList.contains('code-wrapper')) return;
      const codeEl = pre.querySelector('code');
      const text = codeEl ? codeEl.innerText : pre.innerText;
      const langClass = Array.from(codeEl?.classList || []).find((c) => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '').toUpperCase() : 'CODE';

      const wrap = document.createElement('div');
      wrap.className = 'code-wrapper';
      wrap.innerHTML = `<div class="code-header"><span>[ ${lang} ]</span><button class="code-copy-btn"><i class="fa-regular fa-copy"></i> SALIN</button></div>`;
      const copyBtn = wrap.querySelector('.code-copy-btn');
      copyBtn.onclick = () => copyToClipboard(text, copyBtn, 'TERSALIN!');

      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
    });
  };

  // --- Message Rendering & Inline Editing ---
  const renderActiveMessages = () => {
    const s = getCurrentSession();
    messagesList.innerHTML = '';
    if (!s || !s.messages?.length) {
      welcomeScreen.style.display = 'flex';
      return;
    }
    welcomeScreen.style.display = 'none';
    s.messages.forEach((m, idx) => {
      if (m.role === 'user') renderUserMessage(m.text, m.attachment, m.time, idx);
      else renderBotMessage(m.text, m.time);
    });
    scrollToBottom();
  };

  const renderUserMessage = (text, att, timeStr, idx) => {
    const row = document.createElement('div');
    row.className = 'message-row user';
    if (idx !== undefined) row.dataset.msgIndex = idx;

    let attHtml = '';
    if (att) {
      const isImg = att.type === 'image' && att.previewUrl;
      const icon = att.type === 'audio' ? 'fa-microphone' : 'fa-file-lines';
      attHtml = `
        <div class="bubble-attachment">
          ${isImg ? `<img src="${att.previewUrl}" alt="Preview">` : `<span class="bubble-att-icon"><i class="fa-solid ${icon}"></i></span>`}
          <div class="att-info"><span class="att-name">${escapeHtml(att.name)}</span><span class="att-size">${formatBytes(att.size)}</span></div>
        </div>`;
    }

    row.innerHTML = `
      <div class="avatar user-avatar" title="User"><i class="fa-solid fa-user"></i></div>
      <div class="message-content">
        <div class="message-bubble user-bubble">
          ${attHtml}
          ${text ? `<div class="message-text-content"><p style="margin:0;white-space:pre-wrap;">${escapeHtml(text)}</p></div>` : ''}
        </div>
        <div class="message-meta-row">
          <div class="message-actions user-actions">
            <button class="btn-msg-action btn-copy-msg" title="Salin Pertanyaan"><i class="fa-regular fa-copy"></i></button>
            ${text ? `<button class="btn-msg-action btn-edit-msg" title="Edit Pertanyaan"><i class="fa-solid fa-pen-to-square"></i></button>` : ''}
          </div>
          <span class="message-time">${timeStr || getTimeStr()}</span>
        </div>
      </div>`;

    const copyBtn = row.querySelector('.btn-copy-msg');
    copyBtn.onclick = () => copyToClipboard(text || att?.name || '', copyBtn);

    const editBtn = row.querySelector('.btn-edit-msg');
    if (editBtn) editBtn.onclick = () => !isGenerating && startInlineEdit(row, text, idx);

    messagesList.appendChild(row);
  };

  const startInlineEdit = (row, originalText, msgIdx) => {
    const bubble = row.querySelector('.message-bubble');
    const meta = row.querySelector('.message-meta-row');
    if (!bubble) return;
    const oldHtml = bubble.innerHTML;
    if (meta) meta.style.display = 'none';

    bubble.innerHTML = `
      <div class="inline-edit-wrapper">
        <textarea class="inline-edit-textarea" rows="3">${escapeHtml(originalText)}</textarea>
        <div class="inline-edit-actions">
          <button type="button" class="btn-edit-cancel">Batal</button>
          <button type="button" class="btn-edit-submit"><i class="fa-solid fa-paper-plane"></i> Kirim Ulang</button>
        </div>
      </div>`;

    const ta = bubble.querySelector('.inline-edit-textarea');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    const cancel = () => {
      bubble.innerHTML = oldHtml;
      if (meta) meta.style.display = 'flex';
    };
    bubble.querySelector('.btn-edit-cancel').onclick = cancel;

    const submit = () => {
      const val = ta.value.trim();
      if (!val) return;
      resubmitQuestion(msgIdx, val);
    };
    bubble.querySelector('.btn-edit-submit').onclick = submit;

    ta.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') cancel();
    };
  };

  const resubmitQuestion = (msgIdx, newText) => {
    if (isGenerating) return;
    const s = getCurrentSession();
    if (!s?.messages) return;

    const targetIdx = (msgIdx >= 0) ? msgIdx : s.messages.length - 1;
    s.messages = s.messages.slice(0, targetIdx);
    s.conversationHistory = [];
    s.messages.forEach((m) => {
      const prefix = m.attachment ? `[File terlampir: ${m.attachment.name}] ` : '';
      s.conversationHistory.push({ role: m.role === 'user' ? 'user' : 'model', text: prefix + m.text });
    });

    saveSessions();
    renderHistory();
    renderActiveMessages();

    promptInput.value = newText;
    promptInput.style.height = 'auto';
    chatForm.dispatchEvent(new Event('submit'));
  };

  const renderBotMessage = (markdownText, timeStr) => {
    const row = document.createElement('div');
    row.className = 'message-row bot';
    row.innerHTML = `
      <div class="avatar bot-avatar" title="Chatbot AI"><i class="fa-solid fa-robot"></i></div>
      <div class="message-content">
        <div class="message-bubble">${renderMarkdown(markdownText)}</div>
        <div class="message-meta-row">
          <div class="message-actions bot-actions">
            <button class="btn-msg-action btn-copy-msg" title="Salin Jawaban"><i class="fa-regular fa-copy"></i></button>
          </div>
          <span class="message-time">${timeStr || getTimeStr()}</span>
        </div>
      </div>`;

    const copyBtn = row.querySelector('.btn-copy-msg');
    copyBtn.onclick = () => copyToClipboard(markdownText, copyBtn);
    enhanceCodeBlocks(row);
    messagesList.appendChild(row);
  };

  const createStreamingBotRow = () => {
    const row = document.createElement('div');
    row.className = 'message-row bot';
    row.innerHTML = `
      <div class="avatar bot-avatar" title="Chatbot AI"><i class="fa-solid fa-robot"></i></div>
      <div class="message-content">
        <div class="message-bubble"><span class="streaming-cursor">▊</span></div>
        <div class="message-meta-row">
          <div class="message-actions bot-actions" style="display:none;">
            <button class="btn-msg-action btn-copy-msg" title="Salin Jawaban"><i class="fa-regular fa-copy"></i></button>
          </div>
          <span class="message-time">${getTimeStr()}</span>
        </div>
      </div>`;
    messagesList.appendChild(row);
    return {
      row,
      bubble: row.querySelector('.message-bubble'),
      actions: row.querySelector('.bot-actions'),
    };
  };

  const finalizeStreamingBubble = (streamUI, markdownText) => {
    streamUI.bubble.innerHTML = renderMarkdown(markdownText);
    enhanceCodeBlocks(streamUI.row);
    if (streamUI.actions) {
      streamUI.actions.style.display = 'flex';
      const btn = streamUI.actions.querySelector('.btn-copy-msg');
      if (btn) btn.onclick = () => copyToClipboard(markdownText, btn);
    }
  };

  // --- Form & Submit Handling ---
  promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + 'px';
  });

  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating) chatForm.dispatchEvent(new Event('submit'));
    }
  });

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = promptInput.value.trim();
    if ((!text && !currentAttachment) || isGenerating) return;

    let session = getCurrentSession();
    if (!session) {
      createNewSession(false);
      session = getCurrentSession();
    }
    welcomeScreen.style.display = 'none';

    const attached = currentAttachment;
    clearAttachment();
    promptInput.value = '';
    promptInput.style.height = 'auto';

    const timeStr = getTimeStr();
    if (!session.messages?.length || session.title === 'Obrolan Baru') {
      session.title = text ? (text.length > 25 ? text.slice(0, 25) + '...' : text) : (attached ? attached.name : 'Percakapan');
    }

    const attMeta = attached ? {
      type: attached.type,
      name: attached.name,
      size: attached.size,
      previewUrl: attached.type === 'image' ? attached.previewUrl : null,
    } : null;

    if (!session.messages) session.messages = [];
    session.messages.push({ role: 'user', text, attachment: attMeta, time: timeStr });
    saveSessions();
    renderHistory();
    renderUserMessage(text, attMeta, timeStr, session.messages.length - 1);
    scrollToBottom();

    abortController = new AbortController();
    setLoading(true);

    let streamUI = null;
    let botText = '';

    try {
      if (attached) {
        const formData = new FormData();
        formData.append('prompt', text || 'Analisis dan jelaskan berkas terlampir ini');
        const endpoint = attached.type === 'image' ? '/generate-from-image' : attached.type === 'audio' ? '/generate-from-audio' : '/generate-from-document';
        formData.append(attached.type === 'image' ? 'image' : attached.type === 'audio' ? 'audio' : 'document', attached.file);

        const res = await fetch(endpoint, { method: 'POST', body: formData, signal: abortController.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan saat memproses file');

        const botResponse = data.result || 'Tidak ada teks yang dihasilkan.';
        const userWithContext = `[File terlampir: ${attached.name}] ${text}`;
        if (!session.conversationHistory) session.conversationHistory = [];
        session.conversationHistory.push({ role: 'user', text: userWithContext }, { role: 'model', text: botResponse });

        const botTime = getTimeStr();
        session.messages.push({ role: 'bot', text: botResponse, time: botTime });
        saveSessions();
        renderHistory();
        renderBotMessage(botResponse, botTime);
      } else {
        if (!session.conversationHistory) session.conversationHistory = [];
        const res = await fetch('/chat-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history: session.conversationHistory, message: text }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Gagal menghubungi server');
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
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.text) {
                  if (!streamUI) {
                    typingIndicator.style.display = 'none';
                    streamUI = createStreamingBotRow();
                  }
                  botText += parsed.text;
                  streamUI.bubble.innerHTML = renderMarkdown(botText) + '<span class="streaming-cursor">▊</span>';
                  scrollToBottom();
                }
              } catch (err) {
                if (!err.message?.includes('JSON')) throw err;
              }
            }
          }
        }

        const botTime = getTimeStr();
        if (streamUI) finalizeStreamingBubble(streamUI, botText);
        else renderBotMessage(botText || 'Tidak ada respons.', botTime);

        session.conversationHistory.push({ role: 'user', text }, { role: 'model', text: botText });
        session.messages.push({ role: 'bot', text: botText, time: botTime });
        saveSessions();
        renderHistory();
      }
    } catch (err) {
      const isAbort = err.name === 'AbortError' || abortController?.signal?.aborted;
      const botTime = getTimeStr();
      const output = isAbort
        ? (botText ? `${botText}\n\n*(Dihentikan)*` : '*(Respon dihentikan oleh pengguna)*')
        : `⚠️ **Error**: ${err.message || 'Gagal terhubung ke server backend'}`;

      if (streamUI) finalizeStreamingBubble(streamUI, output);
      else renderBotMessage(output, botTime);

      session.messages.push({ role: 'bot', text: output, time: botTime });
      if (isAbort && botText) {
        session.conversationHistory.push({ role: 'user', text }, { role: 'model', text: botText });
      }
      saveSessions();
      renderHistory();
    } finally {
      setLoading(false);
      scrollToBottom();
      promptInput.focus();
    }
  });

  btnStop?.addEventListener('click', () => abortController?.abort());

  // --- Sidebar & Utilities ---
  const toggleSidebar = () => {
    if (window.innerWidth <= 768) sidebar.classList.toggle('open');
    else {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('gemini_pixel_sidebar_collapsed', sidebar.classList.contains('collapsed'));
    }
  };

  btnToggleSidebar?.addEventListener('click', toggleSidebar);
  btnCloseSidebar?.addEventListener('click', () => {
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
    else {
      sidebar.classList.add('collapsed');
      localStorage.setItem('gemini_pixel_sidebar_collapsed', 'true');
    }
  });

  if (window.innerWidth > 768 && localStorage.getItem('gemini_pixel_sidebar_collapsed') === 'true') {
    sidebar.classList.add('collapsed');
  }

  btnNewChat?.addEventListener('click', () => {
    createNewSession(true);
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  });

  btnClearChat?.addEventListener('click', () => {
    const s = getCurrentSession();
    if (!s?.messages?.length) return;
    if (confirm('Bersihkan percakapan ini?')) {
      s.messages = [];
      s.conversationHistory = [];
      s.title = 'Obrolan Baru';
      saveSessions();
      renderHistory();
      renderActiveMessages();
    }
  });

  document.querySelectorAll('.suggestion-card').forEach((card) => {
    card.onclick = () => {
      promptInput.value = card.getAttribute('data-prompt') || '';
      promptInput.dispatchEvent(new Event('input'));
      chatForm.dispatchEvent(new Event('submit'));
    };
  });

  // Init
  loadSessions();
});
