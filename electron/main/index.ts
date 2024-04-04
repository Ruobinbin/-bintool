import { app, BrowserWindow, shell, ipcMain, globalShortcut } from 'electron'
import { release } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

globalThis.__filename = fileURLToPath(import.meta.url)
globalThis.__dirname = dirname(__filename)

// 构建的目录结构
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs    > 预加载脚本
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.DIST_ELECTRON = join(__dirname, '..')
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

// 如果用户正在运行 Windows 7，禁用 GPU 加速
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// 为 Windows 10+ 的通知设置应用程序名称
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

// 如果应用程序不是单实例的，则退出 //确保只有一个应用在启动着
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// 移除 Electron 的安全警告
// 这个警告只在开发模式下显示
// 在 https://www.electronjs.org/docs/latest/tutorial/security 上阅读更多内容
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let win: BrowserWindow | null = null
let novelWin: BrowserWindow | null = null
// 这里，你也可以使用其他的预加载脚本
const preload = join(__dirname, '../preload/index.mjs')

//创建小说窗口
async function createNoverWin() {
  novelWin = new BrowserWindow({
    title: 'Novel window',
    // parent: win,
    webPreferences: {
      preload,
    },
  })

  loadPage(novelWin,"src/novel/novel.html")
}

//创建主窗口方法
async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    webPreferences: {
      preload,
    },
    height: 100,
    // resizable: false, // 禁止调整窗口大小
    // transparent: true, // 设置窗口为透明
    // frame: false, // 移除窗口边框
  })

  // 注册快捷键 Alt+A，如果窗口已经显示，则最小化窗口，否则显示窗口
  globalShortcut.register('Alt+A', () => {
    if (win.isVisible()) {
      win.minimize()
    } else {
      win.show()
      win.webContents.send('win-show')
    }
  })

  // 当窗口失去焦点时，最小化窗口
  win.on('blur', () => {
    win.minimize()
  })

  win.webContents.openDevTools()

  loadPage(win,"index.html")
}

// 当应用准备好时，创建窗口
app.whenReady().then(createWindow)


// 当所有窗口都关闭时
app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

// 如果用户尝试打开另一个窗口，将焦点放在主窗口上
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

// 当应用被激活时
app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// 使所有链接都用浏览器打开，而不是应用程序
function handleWindowOpen(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// 根据环境加载页面
function loadPage(win: BrowserWindow, src: string) {
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}${src}`);
  } else {
    win.loadFile(join(process.env.DIST,src));
  }
}

//-------------------------------------------------------------------------------处理事件
ipcMain.on('open-novel-win', () => {
  createNoverWin()
});