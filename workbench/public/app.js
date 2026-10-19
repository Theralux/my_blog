(() => {
  'use strict'

  const byId = id => document.getElementById(id)
  const ui = Object.fromEntries([
    'saveState', 'openSiteButton', 'publishButton', 'postCount', 'newPostButton',
    'searchInput', 'listHint', 'postList', 'editorContext', 'editorHeading',
    'editorSubtitle', 'saveButton', 'postForm', 'titleInput', 'slugInput',
    'slugHelp', 'dateInput', 'categoriesInput', 'tagsInput', 'excerptInput',
    'bodyInput', 'draftInput', 'draftLabel', 'draftDescription', 'wordCount',
    'footerSaveButton', 'writeTab', 'previewTab', 'writePane', 'markdownPreview',
    'imageButton', 'imageInput', 'publishLight', 'publishState', 'publishDetail',
    'branchValue', 'changeCount', 'changedFiles', 'publishLog', 'refreshButton',
    'publishDialog', 'publishForm', 'publishDialogDescription', 'publishDialogFiles',
    'commitMessageInput', 'cancelPublishButton', 'confirmPublishButton', 'toast',
  ].map(id => [id, byId(id)]))

  const fields = ['titleInput', 'slugInput', 'dateInput', 'categoriesInput',
    'tagsInput', 'excerptInput', 'bodyInput', 'draftInput'].map(id => ui[id])
  const state = {
    posts: [], current: null, baseline: '', dirty: false, loading: true,
    saving: false, uploading: false, previewStarting: false, preparing: false,
    submitting: false, status: null, connected: false, saveError: '',
    originalDate: '', originalDateLocal: '', previewSequence: 0,
  }
  let toastTimer
  let statusRequest = null

  function toast(message, error = false, link) {
    clearTimeout(toastTimer)
    ui.toast.replaceChildren(document.createTextNode(message))
    if (link) {
      const anchor = document.createElement('a')
      anchor.href = link
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.textContent = ' 打开预览 ↗'
      ui.toast.append(anchor)
    }
    ui.toast.classList.toggle('is-error', error)
    ui.toast.classList.add('is-visible')
    toastTimer = setTimeout(() => ui.toast.classList.remove('is-visible'), error || link ? 9000 : 4500)
  }

  async function api(url, options = {}) {
    let response
    try {
      response = await fetch(url, { cache: 'no-store', ...options })
    }
    catch {
      throw new Error('无法连接本地工作台。请确认启动窗口仍在运行，内容暂时保留在编辑器中。')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || `请求失败（${response.status}）。`)
      error.status = response.status
      throw error
    }
    return data
  }

  const jsonOptions = (method, payload = {}) => ({
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const pad = value => String(value).padStart(2, '0')

  function localDate(value) {
    const date = value ? new Date(value) : new Date()
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function postDate() {
    const value = ui.dateInput.value
    if (value === state.originalDateLocal && state.originalDate) return state.originalDate
    const date = new Date(value)
    if (!value || Number.isNaN(date.getTime())) throw new Error('请填写有效的发布日期。')
    const offset = -date.getTimezoneOffset()
    const sign = offset >= 0 ? '+' : '-'
    return `${localDate(date)}:00${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  }

  function dateLabel(value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '日期待填写' : new Intl.DateTimeFormat('zh-CN', {
      month: 'short', day: 'numeric',
    }).format(date)
  }

  function snapshot() {
    return JSON.stringify(fields.map(field => field.type === 'checkbox' ? field.checked : field.value))
  }

  function editorLocked() {
    return state.loading || state.saving || state.uploading || state.preparing || state.submitting
  }

  function renderControls() {
    const locked = editorLocked()
    const publishing = Boolean(state.status?.publishing)
    for (const field of fields) field.disabled = locked
    ui.slugInput.readOnly = Boolean(state.current)
    for (const button of document.querySelectorAll('[data-insert]')) button.disabled = locked
    ui.newPostButton.disabled = locked
    for (const button of ui.postList.querySelectorAll('button')) button.disabled = locked
    ui.saveButton.disabled = locked || publishing
    ui.footerSaveButton.disabled = locked || publishing
    ui.imageButton.disabled = locked || publishing
    ui.imageInput.disabled = locked || publishing
    ui.openSiteButton.disabled = locked || state.previewStarting
    ui.publishButton.disabled = locked || publishing || !state.connected
    ui.confirmPublishButton.disabled = state.submitting
    ui.saveButton.textContent = state.saving ? '正在保存…' : '保存文章'
    ui.footerSaveButton.textContent = state.saving ? '正在保存…' : '保存文章 →'
    ui.imageButton.textContent = state.uploading ? '正在上传…' : '▧ 插入图片'
    ui.openSiteButton.textContent = state.previewStarting ? '启动预览中…' : '预览博客 ↗'
    ui.publishButton.textContent = publishing || state.submitting ? '同步中…' : '同步到线上 →'

    let label = state.current ? '已保存到本地' : '新文章 · 尚未保存'
    let tone = state.current ? 'is-saved' : ''
    if (state.dirty) { label = '有修改尚未保存'; tone = 'is-dirty' }
    if (state.saveError) { label = '保存失败 · 内容仍保留'; tone = 'is-error' }
    if (state.loading) { label = '正在读取文章…'; tone = '' }
    if (state.saving) { label = '正在保存到本地…'; tone = '' }
    if (state.uploading) { label = '正在上传图片…'; tone = '' }
    ui.saveState.textContent = label
    ui.saveState.className = `save-state ${tone}`
    ui.wordCount.textContent = `${ui.bodyInput.value.replace(/\s/g, '').length.toLocaleString('zh-CN')} 字`
    ui.draftLabel.textContent = ui.draftInput.checked ? '保存为草稿' : '设为公开文章'
    ui.draftDescription.textContent = ui.draftInput.checked
      ? '草稿不会显示在正式博客' : '同步到线上后会显示在博客'
    document.title = `${state.dirty ? '● ' : ''}${ui.titleInput.value.trim() || '写作工作台'} · luxの手札`
  }

  function markEdited() {
    state.dirty = snapshot() !== state.baseline
    state.saveError = ''
    renderControls()
  }

  function canLeave() {
    if (editorLocked()) return false
    return !state.dirty || window.confirm('这篇文章有尚未保存的修改。确定放弃这些修改并切换吗？')
  }

  function setPost(post = null) {
    state.current = post
    state.originalDate = post?.date || ''
    state.originalDateLocal = localDate(post?.date)
    const now = new Date()
    ui.titleInput.value = post?.title || ''
    ui.slugInput.value = post?.slug || `note-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    ui.dateInput.value = state.originalDateLocal
    ui.categoriesInput.value = (post?.categories || []).join(', ')
    ui.tagsInput.value = (post?.tags || []).join(', ')
    ui.excerptInput.value = post?.excerpt || ''
    ui.bodyInput.value = post?.body || ''
    ui.draftInput.checked = post ? post.draft : true
    ui.editorContext.textContent = post ? post.slug : '新的手札'
    ui.editorHeading.textContent = post ? '继续这一页手札' : '写下新的一页'
    ui.editorSubtitle.textContent = '内容先保存在电脑里，准备好再同步到博客。'
    ui.slugHelp.textContent = post
      ? `文章链接：/posts/${post.slug}；保存后固定名称，避免旧链接失效。`
      : '用于文章链接，只写小写英文字母、数字和短横线。'
    state.baseline = snapshot()
    state.dirty = false
    state.saveError = ''
    state.previewSequence += 1
    setTab('write')
    renderPosts()
    renderControls()
  }

  function renderPosts() {
    const query = ui.searchInput.value.trim().toLocaleLowerCase()
    const posts = state.posts.filter(post => [post.title, post.slug, ...(post.tags || []), ...(post.categories || [])]
      .join(' ').toLocaleLowerCase().includes(query))
    ui.postCount.textContent = state.posts.length
    ui.listHint.textContent = query ? `找到 ${posts.length} 篇` : '按更新时间排序'
    ui.postList.replaceChildren()
    if (!posts.length) {
      const empty = document.createElement('p')
      empty.className = 'list-placeholder'
      empty.textContent = query ? '没有找到匹配的文章。' : '还没有文章，点击 ＋ 写第一篇。'
      ui.postList.append(empty)
      return
    }
    for (const post of posts) {
      const button = document.createElement('button')
      button.type = 'button'
      const active = post.slug === state.current?.slug
      button.className = `post-item${active ? ' is-active' : ''}`
      button.setAttribute('aria-pressed', String(active))
      button.disabled = editorLocked()
      button.title = post.title
      const title = document.createElement('span')
      title.className = 'post-item-title'
      title.textContent = post.title
      const meta = document.createElement('span')
      meta.className = 'post-item-meta'
      const date = document.createElement('span')
      date.textContent = dateLabel(post.updated || post.date)
      const badge = document.createElement('span')
      badge.className = `post-badge${post.draft ? '' : ' is-public'}`
      badge.textContent = post.draft ? '草稿' : '公开'
      meta.append(date, badge)
      button.append(title, meta)
      button.addEventListener('click', () => loadPost(post.slug))
      ui.postList.append(button)
    }
  }

  async function refreshPosts() {
    const { posts } = await api('/api/posts')
    state.posts = posts
    renderPosts()
  }

  async function loadPost(slug, initial = false) {
    if (!initial && !canLeave()) return
    state.loading = true
    renderControls()
    try {
      const { post } = await api(`/api/posts/${encodeURIComponent(slug)}`)
      setPost(post)
    }
    catch (error) { toast(error.message, true) }
    finally { state.loading = false; renderControls() }
  }

  function payload() {
    const title = ui.titleInput.value.trim()
    const slug = ui.slugInput.value.trim()
    if (!title) { ui.titleInput.focus(); throw new Error('请先填写文章标题。') }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
      ui.slugInput.focus()
      throw new Error('网址名称请使用小写英文字母、数字和短横线，不超过 100 个字符。')
    }
    const list = value => [...new Set(value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean))]
    return {
      slug, title, date: postDate(), updated: state.current?.updated || '',
      excerpt: ui.excerptInput.value.trim(), categories: list(ui.categoriesInput.value),
      tags: list(ui.tagsInput.value), draft: ui.draftInput.checked,
      body: ui.bodyInput.value, revision: state.current?.revision,
    }
  }

  async function savePost(quiet = false) {
    if (state.saving || state.loading || state.uploading || state.status?.publishing) return false
    if (state.current && !state.dirty) {
      if (!quiet) toast('内容已保存，没有新的修改。')
      return true
    }
    let data
    try { data = payload() }
    catch (error) { toast(error.message, true); return false }
    state.saving = true
    state.saveError = ''
    renderControls()
    try {
      const url = state.current ? `/api/posts/${encodeURIComponent(state.current.slug)}` : '/api/posts'
      const { post } = await api(url, jsonOptions(state.current ? 'PUT' : 'POST', data))
      setPost(post)
      if (!quiet) toast(post.draft ? '草稿已保存到本地。' : '文章已保存到本地，准备好后可同步到线上。')
      await Promise.allSettled([refreshPosts(), refreshStatus()])
      return true
    }
    catch (error) {
      state.saveError = error.message
      toast(error.status === 409
        ? `${error.message} 编辑内容仍保留；可先复制正文，再点击左侧文章重新载入。`
        : error.message, true)
      return false
    }
    finally { state.saving = false; renderControls() }
  }

  function setTab(tab) {
    const preview = tab === 'preview'
    ui.writePane.hidden = preview
    ui.markdownPreview.hidden = !preview
    ui.writeTab.classList.toggle('is-active', !preview)
    ui.previewTab.classList.toggle('is-active', preview)
    ui.writeTab.setAttribute('aria-selected', String(!preview))
    ui.previewTab.setAttribute('aria-selected', String(preview))
    if (preview) void renderMarkdown()
  }

  async function renderMarkdown() {
    const sequence = ++state.previewSequence
    ui.markdownPreview.textContent = '正在生成预览…'
    try {
      const { html } = await api('/api/markdown-preview', jsonOptions('POST', { body: ui.bodyInput.value }))
      if (sequence !== state.previewSequence) return
      if (html) ui.markdownPreview.innerHTML = html
      else ui.markdownPreview.textContent = '正文还是空白，先写下几句话吧。'
    }
    catch (error) {
      if (sequence === state.previewSequence) ui.markdownPreview.textContent = error.message
    }
  }

  function insertText(text, selectionOffset = text.length, selectionLength = 0) {
    const input = ui.bodyInput
    const start = input.selectionStart
    input.setRangeText(text, start, input.selectionEnd, 'end')
    input.focus()
    input.setSelectionRange(start + selectionOffset, start + selectionOffset + selectionLength)
    markEdited()
  }

  function insertMarkdown(kind) {
    if (editorLocked()) return
    const input = ui.bodyInput
    const selected = input.value.slice(input.selectionStart, input.selectionEnd)
    if (kind === 'bold') {
      const text = selected || '加粗文字'
      insertText(`**${text}**`, 2, text.length)
    }
    if (kind === 'link') {
      const text = selected || '链接文字'
      insertText(`[${text}](https://)`, text.length + 3, 8)
    }
    if (kind === 'heading') {
      const prefix = input.selectionStart > 0 && input.value[input.selectionStart - 1] !== '\n' ? '\n\n' : ''
      const text = selected || '小标题'
      insertText(`${prefix}## ${text}\n`, prefix.length + 3, text.length)
    }
  }

  async function uploadImage() {
    const file = ui.imageInput.files[0]
    ui.imageInput.value = ''
    if (!file || editorLocked() || state.status?.publishing) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) {
      toast('请选择 JPG、PNG、WebP、GIF 或 AVIF 图片。', true)
      return
    }
    if (file.size > 12 * 1024 * 1024) { toast('图片不能超过 12 MB。', true); return }
    state.uploading = true
    renderControls()
    try {
      const { url } = await api(`/api/images?name=${encodeURIComponent(file.name)}`, {
        method: 'POST', headers: { 'Content-Type': file.type }, body: file,
      })
      state.uploading = false
      renderControls()
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]\\\r\n]/g, '')
      insertText(`\n\n![${alt}](${url})\n\n`)
      toast('图片已插入，记得保存文章。')
      void refreshStatus()
    }
    catch (error) { toast(error.message, true) }
    finally { state.uploading = false; renderControls() }
  }

  function renderStatus() {
    const status = state.status
    const card = ui.publishLight.closest('.status-card')
    card.className = 'status-card'
    if (!state.connected || !status) {
      card.classList.add('is-error')
      ui.publishState.textContent = '本地服务未连接'
      ui.publishDetail.textContent = '请确认工作台仍在运行，然后刷新'
      renderControls()
      return
    }
    const count = status.changedFiles.length
    const ahead = status.ahead || 0
    ui.branchValue.textContent = status.branch || '未识别'
    ui.changeCount.textContent = ahead ? `${count} 个 · ${ahead} 个待推送提交` : `${count} 个`
    ui.changedFiles.replaceChildren()
    for (const file of status.changedFiles) {
      const item = document.createElement('li')
      item.textContent = file
      ui.changedFiles.append(item)
    }
    if (!count) {
      const item = document.createElement('li')
      item.className = 'muted'
      item.textContent = ahead ? '文件已提交，等待推送到 GitHub。' : '没有未提交的文章或图片。'
      ui.changedFiles.append(item)
    }
    ui.publishLog.textContent = status.publishLog?.length ? status.publishLog.join('\n') : '还没有同步记录。'
    if (status.publishing) {
      card.classList.add('is-busy')
      ui.publishState.textContent = '正在同步到 GitHub'
      ui.publishDetail.textContent = '可以继续写作，同步完成后再保存'
    }
    else if (status.publishError) {
      card.classList.add('is-error')
      ui.publishState.textContent = '同步未完成'
      ui.publishDetail.textContent = ahead ? '提交已保留，可以重新同步' : '请展开同步记录查看原因'
    }
    else if (count || ahead) {
      card.classList.add('is-dirty')
      ui.publishState.textContent = '有内容等待同步'
      ui.publishDetail.textContent = ahead ? `${ahead} 个提交还未推送到 GitHub` : '本地保存完成后，可同步到线上'
    }
    else {
      ui.publishState.textContent = status.publishResult ? '已推送到 GitHub' : '本地内容已同步'
      ui.publishDetail.textContent = status.publishResult ? '等待 Vercel 完成部署' : '写下新的内容，再从这里发布'
    }
    renderControls()
  }

  function refreshStatus() {
    if (statusRequest) return statusRequest
    statusRequest = (async () => {
      try {
        const status = await api('/api/status')
        const finished = state.status?.publishing && !status.publishing
        state.status = status
        state.connected = true
        renderStatus()
        if (finished) {
          toast(status.publishError ? '同步未完成，请查看右侧同步记录。' : '已推送到 GitHub，Vercel 将自动更新博客。', Boolean(status.publishError))
          void refreshPosts().catch(() => {})
        }
        return status
      }
      catch (error) {
        state.connected = false
        renderStatus()
        return null
      }
      finally { statusRequest = null }
    })()
    return statusRequest
  }

  async function openBlogPreview() {
    if (editorLocked() || state.previewStarting) return
    const tab = window.open('about:blank', '_blank')
    if (tab) {
      tab.opener = null
      tab.document.title = '正在启动博客预览…'
      tab.document.body.textContent = '正在保存内容并启动博客预览，请稍候…'
    }
    state.previewStarting = true
    renderControls()
    try {
      if (state.dirty && !await savePost(true)) { tab?.close(); return }
      const { url } = await api('/api/preview/start', jsonOptions('POST'))
      if (tab && !tab.closed) tab.location.replace(url)
      else toast('博客预览已启动。', false, url)
      void refreshStatus()
    }
    catch (error) { tab?.close(); toast(error.message, true) }
    finally { state.previewStarting = false; renderControls() }
  }

  async function preparePublish() {
    if (editorLocked() || state.status?.publishing) return
    state.preparing = true
    renderControls()
    try {
      if (state.dirty && !await savePost(true)) return
      const status = await refreshStatus()
      if (!status) { toast('无法读取同步状态，请确认本地服务仍在运行。', true); return }
      if (status.publishing) return
      if (!status.changedFiles.length && !status.ahead) { toast('当前没有需要同步的文章、图片或提交。'); return }
      ui.publishDialogDescription.textContent = `将 ${status.changedFiles.length} 个改动文件${status.ahead ? `及 ${status.ahead} 个待推送提交` : ''} 同步到 GitHub，然后由 Vercel 更新博客。`
      ui.publishDialogFiles.replaceChildren()
      for (const file of status.changedFiles) {
        const row = document.createElement('div')
        row.textContent = file
        ui.publishDialogFiles.append(row)
      }
      if (status.ahead) {
        const row = document.createElement('div')
        row.textContent = `${status.ahead} 个本地提交等待推送`
        ui.publishDialogFiles.append(row)
      }
      ui.publishDialog.showModal()
    }
    finally { state.preparing = false; renderControls() }
  }

  async function confirmPublish(event) {
    event.preventDefault()
    if (state.submitting || state.status?.publishing) return
    state.submitting = true
    renderControls()
    try {
      await api('/api/publish', jsonOptions('POST', { message: ui.commitMessageInput.value.trim() || '更新博客内容' }))
      ui.publishDialog.close()
      state.status = { ...state.status, publishing: true, publishError: '', publishResult: '', publishLog: ['正在开始同步…'] }
      renderStatus()
      document.querySelector('.publish-log-details').open = true
      void refreshStatus()
    }
    catch (error) { toast(error.message, true) }
    finally { state.submitting = false; renderControls() }
  }

  ui.postForm.addEventListener('input', markEdited)
  ui.postForm.addEventListener('change', markEdited)
  ui.postForm.addEventListener('submit', event => { event.preventDefault(); void savePost() })
  ui.searchInput.addEventListener('input', renderPosts)
  ui.newPostButton.addEventListener('click', () => {
    if (!canLeave()) return
    setPost()
    ui.titleInput.focus()
  })
  ui.saveButton.addEventListener('click', () => { void savePost() })
  ui.footerSaveButton.addEventListener('click', () => { void savePost() })
  ui.writeTab.addEventListener('click', () => setTab('write'))
  ui.previewTab.addEventListener('click', () => setTab('preview'))
  for (const button of document.querySelectorAll('[data-insert]')) {
    button.addEventListener('click', () => insertMarkdown(button.dataset.insert))
  }
  ui.imageButton.addEventListener('click', () => ui.imageInput.click())
  ui.imageInput.addEventListener('change', () => { void uploadImage() })
  ui.openSiteButton.addEventListener('click', () => { void openBlogPreview() })
  ui.publishButton.addEventListener('click', () => { void preparePublish() })
  ui.cancelPublishButton.addEventListener('click', () => ui.publishDialog.close())
  ui.publishForm.addEventListener('submit', confirmPublish)
  ui.refreshButton.addEventListener('click', async () => {
    ui.refreshButton.disabled = true
    const results = await Promise.allSettled([refreshPosts(), refreshStatus()])
    const failure = results.find(result => result.status === 'rejected')
    if (failure) toast(failure.reason.message, true)
    ui.refreshButton.disabled = false
  })
  window.addEventListener('beforeunload', event => {
    if (state.dirty || state.saving || state.uploading) { event.preventDefault(); event.returnValue = '' }
  })
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (!editorLocked() && !ui.publishDialog.open) void savePost()
    }
  })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshStatus() })

  async function initialize() {
    setPost()
    renderControls()
    const results = await Promise.allSettled([refreshPosts(), refreshStatus()])
    if (results[0].status === 'rejected') toast(results[0].reason.message, true)
    if (state.posts.length) await loadPost(state.posts[0].slug, true)
    state.loading = false
    renderControls()
    setInterval(() => { if (!document.hidden || state.status?.publishing) void refreshStatus() }, 3000)
  }
  void initialize()
})()
