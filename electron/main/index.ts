import { app, BrowserWindow, shell, ipcMain, globalShortcut, dialog } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'fs'
import fse from 'fs-extra'
import sqlite3 from 'sqlite3';
import { Novel } from '../../src/interfaces/novel';

globalThis.__filename = fileURLToPath(import.meta.url)
globalThis.__dirname = dirname(__filename)

process.env.DIST_ELECTRON = join(__dirname, '..')
console.log('process.env.DIST_ELECTRON:', process.env.DIST_ELECTRON)
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST
let binToolFilesPath = ""

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
      win.webContents.send('winShow')
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
app.whenReady().then(() => {
  // 创建用户文件夹
  const userDataPath = app.getPath('userData')
  binToolFilesPath = join(userDataPath, 'binToolFiles')
  if (!fs.existsSync(binToolFilesPath)) {
    const sourcePath = join(process.env.VITE_PUBLIC, 'binToolFiles')
    fse.copySync(sourcePath, binToolFilesPath)
  }

  createWindow()
})
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
//处理事件----------------------------------------------------------------------------------------------------
//打开小说窗口
ipcMain.on('openNovelWin', () => {
  createNoverWin()
});
//打开文件对话框
ipcMain.handle('openFileDialog', async (event, directory) => {
  const result = await dialog.showOpenDialog({
    defaultPath: directory,
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
});
//获取public路径
ipcMain.handle('getBinToolFilesPath', async () => {
  return binToolFilesPath
});
//数据库----------------------------------------------------------------------------------------------------
let db = new sqlite3.Database('./mydb.sqlite3');
// novel数据库--------------------------------------------------
db.run(`CREATE TABLE IF NOT EXISTS novel (
  id INTEGER PRIMARY KEY,
  content TEXT,
  audioSrc TEXT,
  audioDuration REAL
)`);

ipcMain.handle('insertNovel', async (event, novel: Novel) => {
  return new Promise<void>((resolve, reject) => {
    const { content, audioSrc, audioDuration } = novel;
    
    db.run(`INSERT INTO novel (content, audioSrc, audioDuration) VALUES (?, ?, ?)`, [content, audioSrc, audioDuration], function(err) {
      if (err) {
        reject(new Error(`插入小说数据失败: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
});

ipcMain.handle('deleteNovel', async (event, id) => {
  db.run(`DELETE FROM novel WHERE id = ?`, [id]);
});

ipcMain.handle('updateNovelAudioDuration', async (event, id, audioDuration) => {
  db.run(`UPDATE novel SET audioDuration = ? WHERE id = ?`, [audioDuration, id]);
});

ipcMain.handle('updateNovelAudioSrc', async (event, id, audioSrc) => {
  db.run(`UPDATE novel SET audioSrc = ? WHERE id = ?`, [audioSrc, id]);
});

ipcMain.handle('updateNovelContent', async (event, id, content) => {
  db.run(`UPDATE novel SET content = ? WHERE id = ?`, [content, id]);
});

ipcMain.handle('selectAllNovels', async (event) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM novel`, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
});

ipcMain.handle('selectNovelById', async (event, id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM novel WHERE id = ?`, [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
});

ipcMain.handle('deleteAllNovels', async () => {
  db.run(`DELETE FROM novel`);
});

ipcMain.handle('truncateNovelTable', async (event) => {
  // 删除表内容
  db.run(`DELETE FROM novel`);
  // 收回未使用的磁盘空间
  db.run(`VACUUM`);
});
