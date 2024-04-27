import { app, BrowserWindow, shell, ipcMain, globalShortcut, dialog } from 'electron'
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
console.log('process.env.VITE_PUBLIC:', process.env.VITE_PUBLIC)

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
const otherWin: { [key: string]: BrowserWindow | null } = {
  novel: null,
};
// 这里，你也可以使用其他的预加载脚本
const preload = join(__dirname, '../preload/index.mjs')

//要在渲染进程使用nodejs模块就
// 注释 preload,
// nodeIntegration: true,
// contextIsolation: false,

//创建主窗口方法
async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    webPreferences: {
      preload,
    },
    height: 100,
    resizable: false, // 禁止调整窗口大小
    transparent: true, // 设置窗口为透明
    frame: false, // 移除窗口边框
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

  // win.webContents.openDevTools()

  loadPage(win, "index.html")

  //关闭主窗口时 关闭其他窗口
  win.on('close', () => {
    for (const key in otherWin) {
      const window = otherWin[key];
      if (window && !window.isDestroyed()) {
        window.close();
        otherWin[key] = null;
      }
    }
  });
}
//创建小说窗口
async function createNoverWin() {
  otherWin.novel = new BrowserWindow({
    title: 'Novel window',
    width: 1200,
    // parent: win,
    webPreferences: {
      // preload,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  })

  otherWin.novel.webContents.openDevTools()
  loadPage(otherWin.novel, "src/novel/novel.html")
  //让所有链接都用浏览器打开
  otherWin.novel.webContents.on('will-navigate', function (event, url) {
    event.preventDefault();
    shell.openExternal(url);
  });
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
    win.loadFile(join(process.env.DIST, src));
  }
}

//-------------------------------------------------------------------------------处理事件
//打开小说窗口
ipcMain.on('open-novel-win', () => {
  createNoverWin()
});
//打开文件对话框
ipcMain.handle('open-file-dialog', async (event, directory) => {
  const result = await dialog.showOpenDialog({
    defaultPath: directory,
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
});
//获取public路径
ipcMain.handle('get-public-path', async () => {
  return process.env.VITE_PUBLIC
});