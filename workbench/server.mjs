import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import MarkdownIt from 'markdown-it'
import YAML from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const postsRoot = path.join(projectRoot, 'pages', 'posts')
const imagesRoot = path.join(projectRoot, 'public', 'images')
const postImagesRoot = path.join(imagesRoot, 'posts')
const staticRoot = path.join(__dirname, 'public')
const valaxyCli = path.join(projectRoot, 'node_modules', 'valaxy', 'bin', 'valaxy.mjs')

const workbenchHost = '127.0.0.1'
const workbenchPort = Number.parseInt(process.env.LUX_WORKBENCH_PORT || '4861', 10)
const previewUrl = 'http://localhost:4859/'
const bodyLimit = 2 * 1024 * 1024
const imageLimit = 12 * 1024 * 1024

if (!Number.isInteger(workbenchPort) || workbenchPort < 1024 || workbenchPort > 65535) {
  throw new Error('LUX_WORKBENCH_PORT 必须是 1024 到 65535 之间的端口号。')
}

const allowedHosts = new Set([
  `127.0.0.1:${workbenchPort}`,
  `localhost:${workbenchPort}`,
])
const allowedOrigins = new Set([
  `http://127.0.0.1:${workbenchPort}`,
  `http://localhost:${workbenchPort}`,
])

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

const defaultLinkOpen = markdown.renderer.rules.link_open
  || ((tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options))

markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, index, options, env, renderer)
}

let previewProcess = null
let previewStarting = null
let previewOutput = []
let publishing = false
let publishLog = []
let publishError = ''
let publishResult = ''
const postWrites = new Map()
let activeContentWrites = 0

async function withContentWrite(work) {
  if (publishing) throw httpError(409, '正在同步，请等同步完成后再保存或上传。')
  activeContentWrites += 1
  try {
    return await work()
  }
  finally {
    activeContentWrites -= 1
  }
}

function json(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(data))
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function normalizeArray(value) {
  return (Array.isArray(value) ? value : value == null ? [] : [value])
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function validateSlug(value) {
  const slug = normalizeText(value).toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    throw httpError(400, '文章标识只能使用小写英文字母、数字和连字符，且不能超过 100 个字符。')
  }
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(slug)) {
    throw httpError(400, '这个名称是系统保留名称，请换一个文章标识。')
  }
  return slug
}

function safePath(base, relativePath) {
  const result = path.resolve(base, relativePath)
  const normalizedBase = `${path.resolve(base)}${path.sep}`.toLowerCase()
  if (result.toLowerCase() !== path.resolve(base).toLowerCase()
    && !result.toLowerCase().startsWith(normalizedBase)) {
    throw httpError(400, '路径无效。')
  }
  return result
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
  if (!match) {
    throw httpError(422, '文章缺少有效的 YAML 头信息。')
  }

  let document
  try {
    document = YAML.parseDocument(match[1], {
      prettyErrors: true,
      strict: true,
      version: '1.2',
    })
    if (document.errors.length) throw document.errors[0]
    if (!YAML.isMap(document.contents)) throw new Error('头信息必须是键值列表。')
  }
  catch (error) {
    throw httpError(422, `文章头信息无法解析：${error.message}`)
  }

  const data = document.toJS({ mapAsMap: false }) || {}
  const body = match[2].replace(/^\r?\n/, '')
  return { document, data, body }
}

function revisionFor(source) {
  return crypto.createHash('sha256').update(source).digest('hex')
}

function toPost(slug, source, stats) {
  const { data, body } = parseFrontmatter(source)
  const date = data.date instanceof Date ? data.date.toISOString() : normalizeText(data.date)
  const updated = data.updated instanceof Date ? data.updated.toISOString() : normalizeText(data.updated)

  return {
    slug,
    title: normalizeText(data.title) || slug,
    date,
    updated,
    excerpt: normalizeText(data.excerpt),
    categories: normalizeArray(data.categories),
    tags: normalizeArray(data.tags),
    draft: Boolean(data.draft),
    body,
    revision: revisionFor(source),
    fileUpdatedAt: stats?.mtime?.toISOString?.() || '',
  }
}

async function readPost(slugValue) {
  const slug = validateSlug(slugValue)
  const filePath = safePath(postsRoot, `${slug}.md`)

  try {
    const [source, stats] = await Promise.all([
      fs.readFile(filePath, 'utf8'),
      fs.stat(filePath),
    ])
    return toPost(slug, source, stats)
  }
  catch (error) {
    if (error.code === 'ENOENT') throw httpError(404, '没有找到这篇文章。')
    throw error
  }
}

async function listPosts() {
  await fs.mkdir(postsRoot, { recursive: true })
  const entries = await fs.readdir(postsRoot, { withFileTypes: true })
  const posts = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const slug = entry.name.slice(0, -3)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue

    try {
      const post = await readPost(slug)
      posts.push({
        slug: post.slug,
        title: post.title,
        date: post.date,
        updated: post.updated || post.fileUpdatedAt,
        excerpt: post.excerpt,
        categories: post.categories,
        tags: post.tags,
        draft: post.draft,
      })
    }
    catch (error) {
      console.warn(`[工作台] 跳过无法读取的文章 ${entry.name}: ${error.message}`)
    }
  }

  posts.sort((left, right) => {
    const leftTime = Date.parse(left.updated || left.date) || 0
    const rightTime = Date.parse(right.updated || right.date) || 0
    return rightTime - leftTime || left.title.localeCompare(right.title, 'zh-CN')
  })
  return posts
}

function validatePostPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw httpError(400, '文章数据格式无效。')
  }

  const title = normalizeText(payload.title)
  if (!title) throw httpError(400, '请填写文章标题。')
  if (title.length > 160) throw httpError(400, '文章标题不能超过 160 个字符。')

  const date = normalizeText(payload.date)
  if (!date || Number.isNaN(Date.parse(date))) {
    throw httpError(400, '请填写有效的发布日期。')
  }

  const excerpt = normalizeText(payload.excerpt)
  if (excerpt.length > 500) throw httpError(400, '摘要不能超过 500 个字符。')

  const body = String(payload.body ?? '').replace(/\r\n/g, '\n')
  if (body.length > 1_500_000) throw httpError(413, '文章正文过长。')

  return {
    title,
    date,
    updated: normalizeText(payload.updated),
    excerpt,
    categories: normalizeArray(payload.categories).slice(0, 20),
    tags: normalizeArray(payload.tags).slice(0, 30),
    draft: Boolean(payload.draft),
    body,
  }
}

function serializePost(document, post) {
  if (!document || !(document instanceof YAML.Document)) {
    document = new YAML.Document({})
  }
  if (!document.contents) document.contents = document.createNode({})

  document.set('title', post.title)
  document.set('date', post.date)
  if (post.updated) document.set('updated', post.updated)
  else document.delete('updated')
  document.set('categories', post.categories)
  document.set('tags', post.tags)
  document.set('excerpt', post.excerpt)
  document.set('draft', post.draft)

  const yaml = document.toString({ lineWidth: 0 }).trimEnd()
  const body = post.body.replace(/^\n+/, '')
  return `---\n${yaml}\n---\n\n${body}${body.endsWith('\n') ? '' : '\n'}`
}

async function writePost(slugValue, payload, options) {
  const slug = validateSlug(slugValue)
  const previous = postWrites.get(slug) || Promise.resolve()
  const pending = previous.catch(() => {}).then(() => writePostFile(slug, payload, options))
  postWrites.set(slug, pending)
  try {
    return await pending
  }
  finally {
    if (postWrites.get(slug) === pending) postWrites.delete(slug)
  }
}

async function writePostFile(slugValue, payload, { create }) {
  const slug = validateSlug(slugValue)
  const filePath = safePath(postsRoot, `${slug}.md`)
  const post = validatePostPayload(payload)
  await fs.mkdir(postsRoot, { recursive: true })

  let document = new YAML.Document({})
  let currentSource = ''
  try {
    currentSource = await fs.readFile(filePath, 'utf8')
    if (create) throw httpError(409, '这个文章标识已经存在，请换一个。')

    const expectedRevision = normalizeText(payload.revision)
    if (!expectedRevision || revisionFor(currentSource) !== expectedRevision) {
      throw httpError(409, '文件已在别处发生变化。请重新载入文章后再保存，避免覆盖内容。')
    }
    document = parseFrontmatter(currentSource).document
  }
  catch (error) {
    if (error.status) throw error
    if (error.code !== 'ENOENT') throw error
    if (!create) throw httpError(404, '没有找到这篇文章。')
  }

  const output = serializePost(document, post)
  if (create) {
    try {
      await fs.writeFile(filePath, output, { encoding: 'utf8', flag: 'wx' })
    }
    catch (error) {
      if (error.code === 'EEXIST') throw httpError(409, '这个文章标识已经存在，请换一个。')
      throw error
    }
  }
  else {
    const temporaryPath = safePath(postsRoot, `.${slug}.${crypto.randomUUID()}.tmp`)
    try {
      await fs.writeFile(temporaryPath, output, { encoding: 'utf8', flag: 'wx' })
      // Replace only after a complete write; a failed write leaves the original article intact.
      await fs.rename(temporaryPath, filePath)
    }
    finally {
      await fs.rm(temporaryPath, { force: true })
    }
  }
  const stats = await fs.stat(filePath)
  return toPost(slug, output, stats)
}

async function readRequestBody(request, limit) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) throw httpError(413, '请求内容过大。')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(request) {
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim()
  if (contentType !== 'application/json') throw httpError(415, '请使用 JSON 格式提交。')
  const buffer = await readRequestBody(request, bodyLimit)
  try {
    return JSON.parse(buffer.toString('utf8') || '{}')
  }
  catch {
    throw httpError(400, 'JSON 内容无法解析。')
  }
}

const imageExtensions = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
])

function safeImageStem(originalName) {
  const stem = path.parse(String(originalName || 'image')).name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return stem || 'image'
}

function dateStamp() {
  const date = new Date()
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = type => parts.find(part => part.type === type)?.value || '00'
  return `${value('year')}${value('month')}${value('day')}-${value('hour')}${value('minute')}${value('second')}`
}

async function saveImage(request, originalName) {
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  const extension = imageExtensions.get(contentType)
  if (!extension) throw httpError(415, '仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片。')

  const data = await readRequestBody(request, imageLimit)
  if (!data.length) throw httpError(400, '图片内容为空。')
  await fs.mkdir(postImagesRoot, { recursive: true })

  const base = `${dateStamp()}-${safeImageStem(originalName)}`
  let fileName = `${base}${extension}`
  let filePath = safePath(postImagesRoot, fileName)
  let counter = 2
  while (true) {
    try {
      await fs.writeFile(filePath, data, { flag: 'wx' })
      break
    }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      fileName = `${base}-${counter}${extension}`
      filePath = safePath(postImagesRoot, fileName)
      counter += 1
    }
  }

  return `/images/posts/${encodeURIComponent(fileName)}`
}

function appendBounded(target, value, maximum = 160) {
  const lines = String(value || '').split(/\r?\n/).map(line => line.trimEnd()).filter(Boolean)
  target.push(...lines)
  if (target.length > maximum) target.splice(0, target.length - maximum)
}

function runCommand(command, args, options = {}) {
  const allowedCodes = options.allowedCodes || [0]
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      windowsHide: true,
      shell: false,
      env: { ...process.env, NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', ...options.env },
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, options.timeout || 120_000)
    let stdout = ''
    let stderr = ''
    const maximum = options.maximumOutput || 256_000
    child.stdout.on('data', chunk => {
      stdout = (stdout + chunk.toString()).slice(-maximum)
      options.onOutput?.(chunk.toString())
    })
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-maximum)
      options.onOutput?.(chunk.toString())
    })
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`${command} 执行超时，请检查网络或终端输出后重试。`))
        return
      }
      const result = { code: code ?? -1, stdout, stderr }
      if (allowedCodes.includes(result.code)) resolve(result)
      else {
        const detail = (stderr || stdout).trim()
        reject(new Error(detail || `${command} 执行失败（退出码 ${result.code}）。`))
      }
    })
  })
}

function runGit(args, options = {}) {
  return runCommand('git', args, options)
}

async function isPreviewRunning() {
  try {
    const response = await fetch(previewUrl, { signal: AbortSignal.timeout(1200) })
    return response.ok && (await response.text()).toLowerCase().includes('valaxy')
  }
  catch {
    return false
  }
}

async function startPreview() {
  if (previewStarting) return previewStarting
  previewStarting = launchPreview().finally(() => { previewStarting = null })
  return previewStarting
}

async function launchPreview() {
  if (await isPreviewRunning()) return previewUrl

  if (previewProcess && previewProcess.exitCode === null) {
    throw httpError(503, '预览仍在启动，请稍后再试。')
  }

  await fs.access(valaxyCli)
  const temporaryDirectory = path.join(projectRoot, '.valaxy', 'temp')
  await fs.mkdir(temporaryDirectory, { recursive: true })
  previewOutput = []
  previewProcess = spawn(process.execPath, [valaxyCli, '.', '--no-remote', '--port', '4859'], {
    cwd: projectRoot,
    windowsHide: true,
    shell: false,
    env: { ...process.env, NO_COLOR: '1', TEMP: temporaryDirectory, TMP: temporaryDirectory, JITI_FS_CACHE: 'true' },
  })
  previewProcess.stdout.on('data', chunk => appendBounded(previewOutput, chunk.toString(), 80))
  previewProcess.stderr.on('data', chunk => appendBounded(previewOutput, chunk.toString(), 80))
  previewProcess.once('error', error => appendBounded(previewOutput, error.message, 80))
  previewProcess.once('close', code => {
    if (code && code !== 0) appendBounded(previewOutput, `预览进程已退出（${code}）。`, 80)
    previewProcess = null
  })

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 400))
    if (await isPreviewRunning()) return previewUrl
    if (!previewProcess) break
  }

  const detail = previewOutput.slice(-8).join('\n')
  throw httpError(500, `博客预览未能启动。${detail ? `\n${detail}` : ''}`)
}

function normalizeRemote(remote) {
  return remote.trim().replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase()
}

function allowedRemote(remote) {
  const normalized = normalizeRemote(remote)
  return normalized === 'https://github.com/theralux/my_blog'
    || normalized === 'git@github.com:theralux/my_blog'
}

async function getManagedChanges() {
  const result = await runGit([
    '-c', 'core.quotePath=false', 'status', '--porcelain=v1', '--untracked-files=all', '--', 'pages/posts', 'public/images',
  ])
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.length > 3 ? line.slice(3) : line)
}

async function getStatus() {
  const [branchResult, remoteResult, changedFiles, previewRunning, aheadResult] = await Promise.all([
    runGit(['branch', '--show-current']).catch(() => ({ stdout: '' })),
    runGit(['remote', 'get-url', 'origin']).catch(() => ({ stdout: '' })),
    getManagedChanges().catch(() => []),
    isPreviewRunning(),
    runGit(['rev-list', '--count', 'origin/main..HEAD']).catch(() => ({ stdout: '0' })),
  ])

  return {
    branch: branchResult.stdout.trim(),
    remote: remoteResult.stdout.trim(),
    changedFiles,
    ahead: Number.parseInt(aheadResult.stdout, 10) || 0,
    previewRunning,
    publishing,
    publishLog: [...publishLog],
    publishError,
    publishResult,
    previewLog: [...previewOutput],
  }
}

async function publish(message) {
  publishing = true
  publishLog = []
  publishError = ''
  publishResult = ''
  const log = value => appendBounded(publishLog, value)

  try {
    const branch = (await runGit(['branch', '--show-current'])).stdout.trim()
    if (branch !== 'main') throw new Error(`当前分支是 ${branch || '未知'}，请切换到 main 后再发布。`)

    const remote = (await runGit(['remote', 'get-url', 'origin'])).stdout.trim()
    const pushRemote = (await runGit(['remote', 'get-url', '--push', '--all', 'origin'])).stdout.trim()
    if (!allowedRemote(remote) || !pushRemote.split(/\r?\n/).every(allowedRemote)) {
      throw new Error('origin 不是 Theralux/my_blog，已停止发布以防推送到错误仓库。')
    }

    const changes = await getManagedChanges()
    if (changes.length) {
      log(`准备提交 ${changes.length} 个博客文件…`)
      await runGit(['add', '--', 'pages/posts', 'public/images'], { onOutput: log })
      const diff = await runGit(['diff', '--cached', '--quiet'], { allowedCodes: [0, 1] })
      if (diff.code === 1) {
        const cleanMessage = normalizeText(message).replace(/[\r\n]+/g, ' ').slice(0, 100) || '更新博客内容'
        // A path-limited commit leaves unrelated files in the user's index untouched.
        await runGit(['commit', '--only', '-m', cleanMessage, '--', 'pages/posts', 'public/images'], { onOutput: log })
        log(`已创建提交：${cleanMessage}`)
      }
    }
    else {
      log('没有新的文章或图片需要提交，继续检查待推送提交…')
    }

    await runGit(['push', 'origin', 'main'], { onOutput: log })
    log('GitHub 推送完成，Vercel 会自动开始部署。')
    publishResult = '发布完成'
  }
  catch (error) {
    publishError = error.message || String(error)
    log(publishError)
  }
  finally {
    publishing = false
  }
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'],
])

async function serveFile(response, base, relativePath) {
  const filePath = safePath(base, relativePath)
  let stats
  try {
    stats = await fs.stat(filePath)
  }
  catch (error) {
    if (error.code === 'ENOENT') throw httpError(404, '文件不存在。')
    throw error
  }
  if (!stats.isFile()) throw httpError(404, '文件不存在。')
  const content = await fs.readFile(filePath)
  response.writeHead(200, {
    'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': content.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(content)
}

function validateRequest(request) {
  const host = String(request.headers.host || '').toLowerCase()
  if (!allowedHosts.has(host)) throw httpError(403, '只允许从本机打开工作台。')

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method || 'GET')) {
    const origin = request.headers.origin
    if (origin && !allowedOrigins.has(String(origin).toLowerCase())) {
      throw httpError(403, '请求来源不受信任。')
    }
  }
}

async function route(request, response) {
  validateRequest(request)
  const url = new URL(request.url || '/', `http://${request.headers.host}`)
  const pathname = decodeURIComponent(url.pathname)
  const method = request.method || 'GET'

  if (method === 'GET' && pathname === '/api/health') {
    return json(response, 200, { app: 'lux-workbench', version: 1 })
  }

  if (method === 'GET' && pathname === '/api/posts') {
    return json(response, 200, { posts: await listPosts() })
  }

  if (method === 'GET' && pathname.startsWith('/api/posts/')) {
    const slug = pathname.slice('/api/posts/'.length)
    return json(response, 200, { post: await readPost(slug) })
  }

  if (method === 'POST' && pathname === '/api/posts') {
    return withContentWrite(async () => {
      const payload = await readJson(request)
      const slug = validateSlug(payload.slug)
      return json(response, 201, { post: await writePost(slug, payload, { create: true }) })
    })
  }

  if (method === 'PUT' && pathname.startsWith('/api/posts/')) {
    return withContentWrite(async () => {
      const slug = pathname.slice('/api/posts/'.length)
      const payload = await readJson(request)
      return json(response, 200, { post: await writePost(slug, payload, { create: false }) })
    })
  }

  if (method === 'POST' && pathname === '/api/images') {
    return withContentWrite(async () => {
      const imageUrl = await saveImage(request, url.searchParams.get('name'))
      return json(response, 201, { url: imageUrl })
    })
  }

  if (method === 'POST' && pathname === '/api/markdown-preview') {
    const payload = await readJson(request)
    return json(response, 200, { html: markdown.render(String(payload.body ?? '')) })
  }

  if (method === 'GET' && pathname === '/api/status') {
    return json(response, 200, await getStatus())
  }

  if (method === 'POST' && pathname === '/api/preview/start') {
    return json(response, 200, { url: await startPreview() })
  }

  if (method === 'POST' && pathname === '/api/publish') {
    if (publishing) throw httpError(409, '发布正在进行，请稍候。')
    const payload = await readJson(request)
    if (publishing || activeContentWrites) throw httpError(409, '仍有保存、上传或同步正在进行，请稍后再试。')
    void publish(payload.message)
    return json(response, 202, { started: true })
  }

  if (method === 'GET' && pathname.startsWith('/images/')) {
    return serveFile(response, imagesRoot, pathname.slice('/images/'.length))
  }

  if (method === 'GET' || method === 'HEAD') {
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    return serveFile(response, staticRoot, relativePath)
  }

  throw httpError(404, '接口不存在。')
}

const server = http.createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "style-src 'self'",
    "script-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self' http://127.0.0.1:4859 http://localhost:4859",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '))
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')

  try {
    await route(request, response)
  }
  catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error(error)
    if (!response.headersSent) json(response, status, { error: error.message || '工作台发生未知错误。' })
    else response.end()
  }
})

function shutdown() {
  if (previewProcess && previewProcess.exitCode === null) previewProcess.kill()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function openWorkbench() {
  const url = `http://${workbenchHost}:${workbenchPort}/`
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
  const browser = spawn(command, args, { windowsHide: true, stdio: 'ignore', detached: true })
  browser.on('error', () => console.log(`请在浏览器打开 ${url}`))
  browser.unref()
}

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    try {
      const existing = await fetch(`http://${workbenchHost}:${workbenchPort}/api/health`, { signal: AbortSignal.timeout(1500) })
      if ((await existing.json()).app === 'lux-workbench') {
        console.log(`工作台已经启动：http://${workbenchHost}:${workbenchPort}/`)
        if (process.argv.includes('--open')) openWorkbench()
        return
      }
    }
    catch { /* Report a port conflict if this is a different service. */ }
    console.error(`端口 ${workbenchPort} 已被其他程序占用，请关闭该程序后重试。`)
  }
  else console.error(`工作台启动失败：${error.message}`)
  process.exitCode = 1
})

server.listen(workbenchPort, workbenchHost, () => {
  console.log(`\n  lux の手札 · 本地工作台`)
  console.log(`  http://${workbenchHost}:${workbenchPort}/\n`)
  if (process.argv.includes('--open')) openWorkbench()
})
