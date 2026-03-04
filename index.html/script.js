/* === JS Block 1 === */
// ─── STATE ─────────────────────────────────
  const state = {
    files:      [],       // all files from API (blob type only)
    filtered:   [],       // currently displayed
    selected:   new Set(),// selected file paths
    view:       'grid',   // 'grid' | 'list'
    filter:     'all',
    pendingDel: null,
    pendingDelArr: [],
    uploadFile: null,
    loaded:     false,
  };

  // ─── DOM REFS ───────────────────────────────
  const $ = id => document.getElementById(id);
  const fileGrid      = $('file-grid');
  const fileList      = $('file-list');
  const emptyState    = $('empty-state');
  const loader        = $('loader');
  const selBox        = $('sel-box');
  const ctxMenu       = $('ctx-menu');
  const modalOverlay  = $('modal-overlay');
  const toastCont     = $('toast-container');
  const fileContainer = $('file-container');

  // ─── CREDENTIAL GETTERS ─────────────────────
  const token  = () => $('inp-token').value.trim();
  const owner  = () => $('inp-owner').value.trim();
  const repo   = () => $('inp-repo').value.trim();
  const branch = () => $('inp-branch').value.trim() || 'main';
  const apiBase= () => `https://api.github.com/repos/${owner()}/${repo()}`;
  const hdrs   = () => ({ Authorization:`token ${token()}`, Accept:'application/vnd.github.v3+json', 'Content-Type':'application/json' });

  // ─── FILE TYPE HELPERS ──────────────────────
  const EXT_ICONS = {
    js:'💛', ts:'💙', jsx:'💛', tsx:'💙', py:'🐍', rb:'💎', go:'🐹',
    rs:'🦀', cpp:'⚙️', c:'⚙️', java:'☕', php:'🐘', swift:'🍊', kt:'💜',
    html:'🌐', css:'🎨', scss:'🎨', vue:'💚', svelte:'🔥',
    json:'📋', yaml:'📋', yml:'📋', toml:'📋', xml:'📋', env:'🔒',
    md:'📝', txt:'📄', pdf:'📕', doc:'📘', docx:'📘',
    png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🎞️', svg:'🎨', ico:'🖼️', webp:'🖼️',
    mp4:'🎬', mp3:'🎵', wav:'🎵', avi:'🎬',
    zip:'📦', tar:'📦', gz:'📦', rar:'📦',
    sh:'🖥️', bash:'🖥️', bat:'🖥️',
    gitignore:'🙈', dockerfile:'🐋', makefile:'⚙️',
    csv:'📊', xls:'📊', xlsx:'📊', sql:'🗄️', db:'🗄️',
  };
  function getIcon(path) {
    const parts = path.split('/');
    const name  = parts[parts.length - 1].toLowerCase();
    if (name === '.gitignore')  return '🙈';
    if (name === 'dockerfile')  return '🐋';
    if (name === 'makefile')    return '⚙️';
    if (name === 'readme.md')   return '📖';
    const ext = name.split('.').pop();
    return EXT_ICONS[ext] || '📄';
  }
  function getType(path) {
    const ext = path.split('.').pop().toLowerCase();
    const codeExts = ['js','ts','jsx','tsx','py','rb','go','rs','cpp','c','java','php','swift','kt','html','css','scss','vue','svelte','sh','bash'];
    const imgExts  = ['png','jpg','jpeg','gif','svg','ico','webp'];
    const docExts  = ['md','txt','pdf','doc','docx'];
    const dataExts = ['json','yaml','yml','toml','xml','csv','xls','xlsx','sql','db'];
    if (codeExts.includes(ext)) return 'code';
    if (imgExts.includes(ext))  return 'image';
    if (docExts.includes(ext))  return 'doc';
    if (dataExts.includes(ext)) return 'data';
    return 'other';
  }
  function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/1048576).toFixed(1) + ' MB';
  }
  function getFileName(path) { return path.split('/').pop(); }

  // ─── TOAST ──────────────────────────────────
  function toast(msg, type='info') {
    const icons = { success:'✅', error:'❌', info:'ℹ️', warn:'⚠️' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span style="font-size:1.1rem">${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    toastCont.prepend(t);
    setTimeout(() => t.remove(), 4200);
  }

  // ─── STATUS ─────────────────────────────────
  function setStatus(msg, dotClass='green') {
    $('status-msg').textContent = msg;
    const dot = $('st-dot');
    dot.className = `status-dot ${dotClass}`;
  }

  // ─── LOAD REPOSITORY ────────────────────────
  async function loadRepo() {
    if (!token() || !owner() || !repo()) { toast('Please fill in all credentials', 'error'); return; }
    showLoader(true);
    setStatus('Loading repository…', 'yellow');
    $('st-branch-show').textContent = '';
    $('st-repo-show').textContent = '';
    try {
      const url = `${apiBase()}/git/trees/${branch()}?recursive=1`;
      const r   = await fetch(url, { headers: hdrs() });
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      const data  = await r.json();
      state.files = (data.tree || []).filter(f => f.type === 'blob');
      state.loaded = true;
      applyFilter();
      updateStats();
      $('st-total').textContent = state.files.length;
      $('st-loaded').textContent = '✓ Yes';
      $('st-branch-show').textContent = `🌿 ${branch()}`;
      $('st-repo-show').textContent = `${owner()}/${repo()}`;
      setStatus(`Loaded ${state.files.length} files from ${owner()}/${repo()}`, 'green');
      toast(`Repository loaded — ${state.files.length} files found`, 'success');
    } catch(e) {
      showLoader(false); showEmpty(true);
      setStatus('Error: ' + e.message, 'red');
      toast('Failed to load: ' + e.message, 'error');
    }
  }

  // ─── RENDER ─────────────────────────────────
  function showLoader(v) {
    loader.style.display  = v ? 'flex' : 'none';
    emptyState.style.display = 'none';
    if (v) { fileGrid.classList.add('hidden'); fileGrid.innerHTML=''; fileList.innerHTML='<div class="list-header"><div></div><div>Name</div><div>Size</div><div>Type</div><div>Path</div></div>'; }
  }
  function showEmpty(v) {
    emptyState.style.display = v ? 'flex' : 'none';
    loader.style.display = 'none';
  }

  function renderFiles(files) {
    showLoader(false); showEmpty(false);
    if (files.length === 0) { showEmpty(true); emptyState.querySelector('.es-title').textContent='No files found'; return; }

    // Grid
    fileGrid.classList.remove('hidden');
    fileGrid.innerHTML = '';
    files.forEach((f, i) => {
      const card = document.createElement('div');
      card.className = 'file-card' + (state.selected.has(f.path) ? ' selected' : '');
      card.dataset.path = f.path;
      card.style.animationDelay = `${Math.min(i*0.03, 0.6)}s`;
      card.innerHTML = `
        <div class="file-check">✓</div>
        <div class="file-icon">${getIcon(f.path)}</div>
        <div class="file-name">${getFileName(f.path)}</div>
        <div class="file-meta">${formatSize(f.size)}</div>`;
      card.addEventListener('click', e => onCardClick(e, f, card));
      card.addEventListener('contextmenu', e => onContextMenu(e, f));
      card.addEventListener('dblclick', () => downloadFile(f));
      fileGrid.appendChild(card);
    });

    // List  
    const rows = fileList.querySelectorAll('.list-row');
    rows.forEach(r => r.remove());
    files.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'list-row' + (state.selected.has(f.path) ? ' selected' : '');
      row.dataset.path = f.path;
      row.style.animationDelay = `${Math.min(i*0.02, 0.5)}s`;
      row.innerHTML = `
        <div class="list-icon">${getIcon(f.path)}</div>
        <div class="list-name">${getFileName(f.path)}</div>
        <div class="list-size">${formatSize(f.size)}</div>
        <div class="list-type">${getType(f.path)}</div>
        <div class="list-date">${f.path.includes('/') ? f.path.split('/').slice(0,-1).join('/') : '/'}</div>`;
      row.addEventListener('click', e => onCardClick(e, f, row));
      row.addEventListener('contextmenu', e => onContextMenu(e, f));
      row.addEventListener('dblclick', () => downloadFile(f));
      fileList.appendChild(row);
    });
  }

  // ─── SELECTION ──────────────────────────────
  let lastSelected = null;
  function onCardClick(e, f, el) {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      // Toggle
      if (state.selected.has(f.path)) { state.selected.delete(f.path); el.classList.remove('selected'); }
      else                             { state.selected.add(f.path);    el.classList.add('selected'); }
    } else if (e.shiftKey && lastSelected) {
      // Range select
      const all  = state.view === 'grid'
        ? [...fileGrid.querySelectorAll('.file-card')]
        : [...fileList.querySelectorAll('.list-row')];
      const idxA = all.findIndex(c => c.dataset.path === lastSelected);
      const idxB = all.findIndex(c => c.dataset.path === f.path);
      const [s,e2] = [Math.min(idxA,idxB), Math.max(idxA,idxB)];
      for (let i=s; i<=e2; i++) {
        state.selected.add(all[i].dataset.path);
        all[i].classList.add('selected');
      }
    } else {
      // Single
      state.selected.clear();
      document.querySelectorAll('.file-card.selected, .list-row.selected').forEach(c=>c.classList.remove('selected'));
      state.selected.add(f.path); el.classList.add('selected');
      // sync both views
      const gridCard = fileGrid.querySelector(`[data-path="${CSS.escape(f.path)}"]`);
      const listRow  = fileList.querySelector(`[data-path="${CSS.escape(f.path)}"]`);
      if (gridCard) gridCard.classList.add('selected');
      if (listRow)  listRow.classList.add('selected');
      showPreview(f);
    }
    lastSelected = f.path;
    updateSelInfo();
    updateStats();
  }

  function showPreview(f) {
    const area = $('preview-area');
    area.innerHTML = `
      <div id="prev-icon" style="font-size:3.5rem;margin-bottom:6px">${getIcon(f.path)}</div>
      <div id="prev-name">${getFileName(f.path)}</div>
      <div id="prev-path" style="font-size:0.68rem;color:var(--muted);text-align:center;word-break:break-all;margin-top:2px">${f.path}</div>
      <div style="display:flex;gap:16px;margin-top:6px">
        <div style="text-align:center"><div style="font-size:0.62rem;color:var(--muted)">SIZE</div><div style="font-size:0.8rem;color:var(--accent);font-weight:600">${formatSize(f.size)}</div></div>
        <div style="text-align:center"><div style="font-size:0.62rem;color:var(--muted)">TYPE</div><div style="font-size:0.8rem;color:var(--green);font-weight:600">${getType(f.path).toUpperCase()}</div></div>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;justify-content:center">
        <button class="btn btn-ghost" style="font-size:0.72rem;padding:5px 10px" onclick="downloadFileByPath('${f.path}')">⬇️ Download</button>
        <button class="btn btn-danger" style="font-size:0.72rem;padding:5px 10px" onclick="confirmDeleteSingle('${f.path}','${f.sha}')">🗑️ Delete</button>
      </div>
    `;
    // auto-fill upload path
    $('up-repo-path').value = f.path;
  }

  function updateSelInfo() {
    const n = state.selected.size;
    $('sel-info').textContent = n > 0 ? `${n} selected` : `${state.filtered.length} items`;
  }
  function updateStats() {
    const n = state.selected.size;
    const t = state.files.length;
    $('st-sel').textContent = n;
    $('st-bar').style.width = t > 0 ? `${(n/t)*100}%` : '0%';
  }

  // ─── RUBBER BAND SELECTION ──────────────────
  let isSelecting = false, selStart = {x:0,y:0};
  fileContainer.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.file-card') || e.target.closest('.list-row')) return;
    isSelecting = true;
    const rect = fileContainer.getBoundingClientRect();
    selStart = { x: e.clientX - rect.left + fileContainer.scrollLeft,
                 y: e.clientY - rect.top  + fileContainer.scrollTop };
    selBox.style.cssText = `left:${selStart.x}px;top:${selStart.y}px;width:0;height:0;display:block`;
    if (!e.ctrlKey && !e.metaKey) {
      state.selected.clear();
      document.querySelectorAll('.file-card.selected,.list-row.selected').forEach(c=>c.classList.remove('selected'));
      updateSelInfo(); updateStats();
    }
  });
  document.addEventListener('mousemove', e => {
    if (!isSelecting) return;
    const rect = fileContainer.getBoundingClientRect();
    const curX = e.clientX - rect.left + fileContainer.scrollLeft;
    const curY = e.clientY - rect.top  + fileContainer.scrollTop;
    const x = Math.min(selStart.x, curX), y = Math.min(selStart.y, curY);
    const w = Math.abs(curX - selStart.x), h = Math.abs(curY - selStart.y);
    selBox.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:block`;

    // Check intersection
    const sbRect = { left:x, top:y, right:x+w, bottom:y+h };
    const items = state.view==='grid'
      ? fileGrid.querySelectorAll('.file-card')
      : fileList.querySelectorAll('.list-row');
    items.forEach(card => {
      const cr  = card.getBoundingClientRect();
      const fcr = fileContainer.getBoundingClientRect();
      const cx  = cr.left - fcr.left + fileContainer.scrollLeft;
      const cy  = cr.top  - fcr.top  + fileContainer.scrollTop;
      const intersects = cx < sbRect.right && cx+cr.width > sbRect.left && cy < sbRect.bottom && cy+cr.height > sbRect.top;
      if (intersects) { state.selected.add(card.dataset.path); card.classList.add('selected'); }
      else if (!e.ctrlKey) { state.selected.delete(card.dataset.path); card.classList.remove('selected'); }
    });
    updateSelInfo(); updateStats();
  });
  document.addEventListener('mouseup', () => { isSelecting = false; selBox.style.display='none'; });

  // ─── CONTEXT MENU ───────────────────────────
  let ctxTarget = null;
  function onContextMenu(e, f) {
    e.preventDefault(); e.stopPropagation();
    ctxTarget = f;
    if (!state.selected.has(f.path)) {
      state.selected.clear();
      document.querySelectorAll('.file-card.selected,.list-row.selected').forEach(c=>c.classList.remove('selected'));
      state.selected.add(f.path);
      const gc = fileGrid.querySelector(`[data-path="${CSS.escape(f.path)}"]`);
      const lr = fileList.querySelector(`[data-path="${CSS.escape(f.path)}"]`);
      if (gc) gc.classList.add('selected');
      if (lr) lr.classList.add('selected');
      showPreview(f);
      updateSelInfo(); updateStats();
    }
    ctxMenu.style.display = 'block';
    const x = Math.min(e.clientX, window.innerWidth  - 200);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top  = y + 'px';
  }
  document.addEventListener('click', () => { ctxMenu.style.display='none'; });
  document.addEventListener('contextmenu', e => { if (!e.target.closest('.file-card')&&!e.target.closest('.list-row')) ctxMenu.style.display='none'; });

  $('ctx-download').onclick = () => { if (ctxTarget) downloadFile(ctxTarget); };
  $('ctx-copy-path').onclick = () => {
    if (ctxTarget) { navigator.clipboard.writeText(ctxTarget.path); toast('Path copied!','success'); }
  };
  $('ctx-copy-url').onclick = () => {
    if (ctxTarget) {
      const url = `https://raw.githubusercontent.com/${owner()}/${repo()}/${branch()}/${ctxTarget.path}`;
      navigator.clipboard.writeText(url); toast('Raw URL copied!','success');
    }
  };
  $('ctx-sel-all').onclick = () => selectAll();
  $('ctx-desel').onclick   = () => deselectAll();
  $('ctx-delete').onclick  = () => { if (ctxTarget) confirmDeleteSingle(ctxTarget.path, ctxTarget.sha); };

  // ─── SELECT ALL / DESELECT ──────────────────
  function selectAll() {
    state.filtered.forEach(f => state.selected.add(f.path));
    document.querySelectorAll('.file-card,.list-row').forEach(c=>c.classList.add('selected'));
    updateSelInfo(); updateStats();
  }
  function deselectAll() {
    state.selected.clear();
    document.querySelectorAll('.file-card.selected,.list-row.selected').forEach(c=>c.classList.remove('selected'));
    updateSelInfo(); updateStats();
  }

  // ─── DOWNLOAD ───────────────────────────────
  async function downloadFile(f) {
    try {
      setStatus(`Downloading ${getFileName(f.path)}…`, 'yellow');
      const url = `${apiBase()}/contents/${f.path}?ref=${branch()}`;
      const r   = await fetch(url, { headers: hdrs() });
      if (!r.ok) throw new Error(r.statusText);
      const data    = await r.json();
      const bytes   = Uint8Array.from(atob(data.content.replace(/\n/g,'')), c=>c.charCodeAt(0));
      const blob    = new Blob([bytes]);
      const a       = document.createElement('a');
      a.href        = URL.createObjectURL(blob);
      a.download    = getFileName(f.path);
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus(`Downloaded: ${f.path}`, 'green');
      toast(`Downloaded: ${getFileName(f.path)}`, 'success');
    } catch(e) {
      setStatus('Download failed: ' + e.message, 'red');
      toast('Download failed: ' + e.message, 'error');
    }
  }
  async function downloadFileByPath(path) {
    const f = state.files.find(x => x.path === path);
    if (f) downloadFile(f);
  }
  async function downloadSelected() {
    if (state.selected.size === 0) { toast('No files selected','warn'); return; }
    const files = state.files.filter(f => state.selected.has(f.path));
    for (const f of files) { await downloadFile(f); await new Promise(r => setTimeout(r, 300)); }
  }

  // ─── ZIP DOWNLOAD ────────────────────────────
  async function downloadAllAsZip() {
    if (!state.loaded || state.files.length === 0) { toast('Load a repository first','warn'); return; }
    await buildAndDownloadZip(state.files, `${repo()}-${branch()}-all.zip`);
  }

  async function downloadSelectedAsZip() {
    if (state.selected.size === 0) { toast('Select at least one file first','warn'); return; }
    const files = state.files.filter(f => state.selected.has(f.path));
    await buildAndDownloadZip(files, `${repo()}-selected-${files.length}files.zip`);
  }

  async function buildAndDownloadZip(files, zipName) {
    if (typeof JSZip === 'undefined') { toast('JSZip not loaded. Check internet connection.','error'); return; }
    const zip = new JSZip();
    const total = files.length;
    let done = 0;

    // Show ZIP progress toast
    const toastEl = document.createElement('div');
    toastEl.className = 'toast info';
    toastEl.innerHTML = `<span style="font-size:1.1rem">🗜️</span>
      <div style="flex:1">
        <div id="zip-toast-txt" style="margin-bottom:6px">Preparing ZIP (0/${total})…</div>
        <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
          <div id="zip-toast-bar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--accent),#7c3aed);border-radius:2px;transition:width 0.25s"></div>
        </div>
      </div>`;
    toastEl.style.cssText += 'min-width:280px;align-items:flex-start;pointer-events:all;';
    toastCont.prepend(toastEl);

    setStatus(`Building ZIP (0/${total})…`, 'yellow');

    const errors = [];
    for (const f of files) {
      try {
        const url = `${apiBase()}/contents/${encodeURIComponent(f.path)}?ref=${branch()}`;
        const r   = await fetch(url, { headers: hdrs() });
        if (!r.ok) throw new Error(r.statusText);
        const data  = await r.json();
        const bytes = Uint8Array.from(atob(data.content.replace(/\n/g,'')), c => c.charCodeAt(0));
        zip.file(f.path, bytes);
        done++;
        const pct = Math.round((done / total) * 100);
        const zipTxt = document.getElementById('zip-toast-txt');
        const zipBar = document.getElementById('zip-toast-bar');
        if (zipTxt) zipTxt.textContent = `Adding files (${done}/${total})…`;
        if (zipBar) zipBar.style.width = pct + '%';
        setStatus(`Building ZIP… ${done}/${total} files`, 'yellow');
      } catch(e) {
        errors.push(f.path);
      }
    }

    // Generate ZIP blob
    const zipTxt2 = document.getElementById('zip-toast-txt');
    if (zipTxt2) zipTxt2.textContent = 'Compressing…';
    const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{ level:6 } });

    // Trigger download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = zipName;
    a.click();
    URL.revokeObjectURL(a.href);

    toastEl.remove();
    const msg = errors.length
      ? `ZIP ready — ${done} files (${errors.length} failed)`
      : `ZIP downloaded — ${done} files`;
    toast(msg, errors.length ? 'warn' : 'success');
    setStatus(msg, errors.length ? 'yellow' : 'green');
  }

  // ─── UPLOAD ─────────────────────────────────
  // ─── UPLOAD STATE ───────────────────────────
  let pendingUploadFiles = [];

  function handleFileSelect(files) {
    if (!files || files.length === 0) return;
    pendingUploadFiles = [...files];
    const names = pendingUploadFiles.map(f => f.name).join(', ');
    $('dz-txt').textContent = names.length > 50 ? names.substring(0,50)+'...' : names;
    const info = $('up-selected-info');
    info.style.display = 'block';
    info.textContent = pendingUploadFiles.length + ' file(s) selected: ' + pendingUploadFiles.map(f=>f.name).join(', ');
    if (pendingUploadFiles.length === 1) {
      $('up-repo-path').value = pendingUploadFiles[0].name;
    }
    toast(pendingUploadFiles.length + ' file(s) ready — click Upload Now', 'info');
  }

  // Drop zone drag events
  $('drop-zone').addEventListener('click', () => $('file-input').click());
  $('drop-zone').addEventListener('dragover', e => { e.preventDefault(); $('drop-zone').classList.add('drag-over'); });
  $('drop-zone').addEventListener('dragleave', e => { if (!$('drop-zone').contains(e.relatedTarget)) $('drop-zone').classList.remove('drag-over'); });
  $('drop-zone').addEventListener('drop', e => {
    e.preventDefault();
    $('drop-zone').classList.remove('drag-over');
    handleFileSelect(e.dataTransfer.files);
  });

  async function uploadFiles() {
    // ── Validation ──────────────────────────────
    if (pendingUploadFiles.length === 0) {
      toast('⚠️ Pehle file select karo!', 'warn');
      $('file-input').click();
      return;
    }
    if (!token()) {
      toast('❌ Token missing! Token field fill karo.', 'error');
      $('inp-token').focus(); return;
    }
    if (!owner() || !repo()) {
      toast('❌ Owner aur Repo name bharo!', 'error'); return;
    }

    const prog     = $('up-progress');
    const bar      = $('up-bar');
    const ptxt     = $('up-progress-txt');
    let repoPath   = $('up-repo-path').value.trim();
    const msg      = $('up-commit-msg').value.trim() || 'Upload via GitXplore';

    if (!repoPath) repoPath = pendingUploadFiles[0].name;

    prog.classList.add('show');
    bar.style.width = '0%';
    let ok = 0;

    for (let i = 0; i < pendingUploadFiles.length; i++) {
      const file  = pendingUploadFiles[i];
      const rpath = pendingUploadFiles.length === 1
        ? repoPath
        : (repoPath ? repoPath.replace(/\/+$/,'') + '/' + file.name : file.name);

      ptxt.textContent = '(' + (i+1) + '/' + pendingUploadFiles.length + ') ' + file.name;
      setStatus('Uploading: ' + rpath + '…', 'yellow');

      try {
        // Step 1: Read file as base64
        const b64 = await readFileBase64(file);
        bar.style.width = '30%';

        // Step 2: Encode URL path
        const encPath = rpath.split('/').map(s => encodeURIComponent(s)).join('/');
        const url = apiBase() + '/contents/' + encPath;

        // Step 3: Check if file already exists (need SHA to update)
        const headers = {
          'Authorization': 'token ' + token(),
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        };
        const chkRes = await fetch(url + '?ref=' + branch(), {
          method: 'GET', headers: headers, cache: 'no-store'
        });
        bar.style.width = '55%';

        const payload = { message: msg, content: b64, branch: branch() };

        if (chkRes.status === 200) {
          const existing = await chkRes.json();
          payload.sha = existing.sha;
          ptxt.textContent = 'Updating existing: ' + file.name;
        } else if (chkRes.status === 401) {
          throw new Error('Token invalid ya expired hai! Naya token banao.');
        } else if (chkRes.status === 404 && chkRes.message === 'Not Found') {
          // new file - no SHA needed
        }

        bar.style.width = '75%';

        // Step 4: PUT request
        const putRes = await fetch(url, {
          method: 'PUT',
          headers: headers,
          body: JSON.stringify(payload)
        });

        bar.style.width = Math.round(((i+1)/pendingUploadFiles.length)*100) + '%';

        if (!putRes.ok) {
          let errMsg = 'HTTP ' + putRes.status;
          try {
            const errJson = await putRes.json();
            errMsg = errJson.message || errMsg;
            if (putRes.status === 401) errMsg = 'Token invalid ya expired! Naya token banao.';
            if (putRes.status === 403) errMsg = 'Token ko repo write permission nahi hai!';
            if (putRes.status === 404) errMsg = 'Repo nahi mila — Owner/Repo name check karo.';
            if (putRes.status === 422) errMsg = 'Path invalid hai — Repo path check karo.';
          } catch(je) {}
          throw new Error(errMsg);
        }

        ok++;
        toast('✅ Uploaded: ' + file.name, 'success');
        setStatus('✅ Uploaded: ' + rpath, 'green');
      } catch(e) {
        const msg2 = e.message || String(e);
        toast('❌ Upload fail [' + file.name + ']: ' + msg2, 'error');
        setStatus('Upload failed: ' + msg2, 'red');
        console.error('[Upload Error]', rpath, e);
      }
    }

    ptxt.textContent = ok + '/' + pendingUploadFiles.length + ' uploaded!';
    setTimeout(() => { prog.classList.remove('show'); bar.style.width='0%'; }, 2500);
    pendingUploadFiles = [];
    $('dz-txt').textContent = 'Click here or drag & drop files';
    $('up-selected-info').style.display = 'none';
    $('file-input').value = '';
    if (ok > 0) await loadRepo();
  }

  function readFileBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result.split(',')[1]);
      r.onerror = () => rej(new Error('Read failed'));
      r.readAsDataURL(file);
    });
  }

  // ─── DELETE ─────────────────────────────────
  function confirmDeleteSingle(path, sha) {
    state.pendingDelArr = [{ path, sha }];
    $('modal-title').textContent = '🗑️ Delete File';
    $('modal-body').innerHTML = `Are you sure you want to permanently delete:<br><br><strong style="color:var(--accent)">${path}</strong><br><br>This <strong>cannot be undone</strong>.`;
    $('modal-confirm').textContent = 'Delete';
    $('modal-confirm').className = 'btn btn-danger';
    modalOverlay.classList.add('show');
  }
  function confirmDeleteSelected() {
    if (state.selected.size === 0) { toast('No files selected','warn'); return; }
    const toDelete = state.files.filter(f => state.selected.has(f.path));
    state.pendingDelArr = toDelete.map(f => ({ path:f.path, sha:f.sha }));
    $('modal-title').textContent = `🗑️ Delete ${toDelete.length} file(s)`;
    $('modal-body').innerHTML = `Permanently delete <strong>${toDelete.length}</strong> file(s)?<br><br><em style="color:var(--muted);font-size:0.8em">${toDelete.slice(0,5).map(f=>f.path).join('<br>')}${toDelete.length>5?`<br>…and ${toDelete.length-5} more`:''}</em><br><br>This <strong>cannot be undone</strong>.`;
    $('modal-confirm').textContent = `Delete ${toDelete.length} files`;
    $('modal-confirm').className = 'btn btn-danger';
    modalOverlay.classList.add('show');
  }
  $('modal-cancel').onclick  = () => modalOverlay.classList.remove('show');
  $('modal-confirm').onclick = async () => {
    modalOverlay.classList.remove('show');
    await deleteFiles(state.pendingDelArr);
  };

  async function deleteFiles(arr) {
    if (arr.length === 0) return;
    setStatus('Deleting ' + arr.length + ' file(s)...', 'yellow');
    let ok = 0, fail = 0;
    for (const {path} of arr) {
      try {
        // Always fetch fresh SHA before delete (stale SHA causes 409 Conflict)
        const encodedPath = path.split('/').map(encodeURIComponent).join('/');
        const checkUrl = apiBase() + '/contents/' + encodedPath + '?ref=' + branch();
        const chk = await fetch(checkUrl, { headers: hdrs() });
        if (!chk.ok) {
          const errData = await chk.json().catch(() => ({}));
          throw new Error(errData.message || 'File not found (' + chk.status + ')');
        }
        const fileData = await chk.json();
        const freshSha = fileData.sha;

        // Delete with fresh SHA
        const r = await fetch(apiBase() + '/contents/' + encodedPath, {
          method: 'DELETE',
          headers: hdrs(),
          body: JSON.stringify({
            message: 'Delete ' + path + ' via GitXplore',
            sha: freshSha,
            branch: branch()
          })
        });
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          throw new Error(errData.message || 'GitHub API error (' + r.status + ')');
        }
        ok++;
        toast('Deleted: ' + getFileName(path), 'success');
        setStatus('Deleted: ' + path, 'green');
      } catch(e) {
        fail++;
        toast('Delete failed — ' + getFileName(path) + ': ' + e.message, 'error');
        setStatus('Delete failed: ' + e.message, 'red');
        console.error('Delete error:', path, e);
      }
    }
    if (ok > 0 && fail === 0) toast(ok + ' file(s) deleted from GitHub!', 'success');
    if (fail > 0) toast(fail + ' deletion(s) failed. Check token permissions (needs repo scope).', 'warn');
    state.selected.clear();
    await loadRepo();
  }

  // ─── FILTER & SEARCH ────────────────────────
  function applyFilter() {
    let files = [...state.files];
    if (state.filter !== 'all') files = files.filter(f => getType(f.path) === state.filter);
    const q = $('search-inp').value.trim().toLowerCase();
    if (q) files = files.filter(f => f.path.toLowerCase().includes(q));
    state.filtered = files;
    renderFiles(files);
    updateSelInfo();
  }

  $('search-inp').addEventListener('input', applyFilter);

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b=>b.classList.remove('active'));
      state.filter = btn.dataset.filter;
      btn.classList.add('active');
      $('sb-all').classList.remove('active');
      applyFilter();
    });
  });
  $('sb-all').addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b=>b.classList.remove('active'));
    $('sb-all').classList.add('active');
    state.filter = 'all';
    applyFilter();
  });

  // ─── VIEW TOGGLE ────────────────────────────
  $('btn-grid').addEventListener('click', () => {
    state.view = 'grid';
    $('btn-grid').classList.add('active'); $('btn-listv').classList.remove('active');
    fileGrid.classList.remove('hidden');   fileList.classList.remove('active');
  });
  $('btn-listv').addEventListener('click', () => {
    state.view = 'list';
    $('btn-listv').classList.add('active'); $('btn-grid').classList.remove('active');
    fileList.classList.add('active');       fileGrid.classList.add('hidden');
  });

  // ─── BUTTON WIRING ──────────────────────────
  $('btn-load').addEventListener('click', loadRepo);
  $('btn-refresh').addEventListener('click', () => { if (state.loaded) loadRepo(); });
  $('btn-dl-sel').addEventListener('click', downloadSelected);
  $('btn-del-sel').addEventListener('click', confirmDeleteSelected);
  // toolbar delete btn already uses onclick attr
  $('btn-upload').addEventListener('click', uploadFiles);

  // Ensure right-panel scrolls with mouse wheel
  document.getElementById('right-panel').addEventListener('wheel', function(e) {
    e.stopPropagation();
    this.scrollTop += e.deltaY;
  }, { passive: true });
  $('sb-upload-btn').addEventListener('click', () => $('upload-panel').scrollIntoView({behavior:'smooth'}));
  $('sb-sel-all').addEventListener('click', selectAll);
  $('sb-desel').addEventListener('click', deselectAll);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { deselectAll(); ctxMenu.style.display='none'; modalOverlay.classList.remove('show'); }
    if ((e.ctrlKey||e.metaKey) && e.key==='a') { e.preventDefault(); selectAll(); }
    if (e.key === 'Delete' && state.selected.size > 0) confirmDeleteSelected();
    if ((e.ctrlKey||e.metaKey) && e.key==='r') { e.preventDefault(); if(state.loaded) loadRepo(); }
  });

  // Click outside deselects (only on file-container bg)
  fileContainer.addEventListener('click', e => {
    if (e.target === fileContainer || e.target === fileGrid || e.target === fileList) deselectAll();
  });

  // ─── TOKEN PERSIST (localStorage = permanent) ───
  (function initToken() {
    const saved = localStorage.getItem('gx_token');
    if (saved) {
      $('inp-token').value = saved;
      showTokenSaved(true);
    }
  })();

  $('inp-token').addEventListener('change', () => {
    const t = $('inp-token').value.trim();
    if (t) {
      localStorage.setItem('gx_token', t);
      showTokenSaved(true);
      toast('✅ Token permanently saved!', 'success');
    }
  });
  $('inp-token').addEventListener('blur', () => {
    const t = $('inp-token').value.trim();
    if (t) { localStorage.setItem('gx_token', t); showTokenSaved(true); }
  });

  function showTokenSaved(show) {
    $('token-saved-badge').style.display = show ? 'inline-block' : 'none';
  }

  function toggleTokenVis() {
    const inp = $('inp-token');
    const btn = $('btn-token-eye');
    if (inp.type === 'password') {
      inp.type = 'text';
      btn.textContent = '🙈';
      btn.style.color = '#ffd32a';
    } else {
      inp.type = 'password';
      btn.textContent = '👁';
      btn.style.color = '';
    }
  }

  // ─── GUIDE MODAL ─────────────────────────────
  function showGuide() {
    const ov = $('guide-overlay');
    ov.style.display = 'flex';
    $('guide-box').style.animation = 'guideIn .3s cubic-bezier(.16,1,.3,1) both';
  }
  function closeGuide() {
    $('guide-overlay').style.display = 'none';
  }
  $('guide-overlay').addEventListener('click', e => {
    if (e.target === $('guide-overlay')) closeGuide();
  });