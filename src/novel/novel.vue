<script setup lang="ts">
import selectFIle from "../components/b-selectFIle-button.vue"

import { join } from 'node:path'
import { computed, onMounted, ref, watch } from "vue"
import { spawn, exec } from 'child_process';
import axios from 'axios';
import fs from 'fs';
import { ipcRenderer } from "electron";
import { VueDraggable } from 'vue-draggable-plus'
import { Novel } from "../interfaces/novel";

onMounted(async () => {
    userFilesPath.value = await ipcRenderer.invoke('getBinToolFilesPath')
    checkAndOpenDocker();
    fetchNovels();
})

const userFilesPath = ref('')
const outputPath = computed(() => join(userFilesPath.value, 'output'))
const gptsovitsModelPath = computed(() => join(userFilesPath.value, 'docker_services/gpt-sovits/model'))
const gptsovitsDockerComposePath = computed(() => join(userFilesPath.value, 'docker_services/gpt-sovits/docker-compose.yaml'))
const aeneasDockerComposePath = computed(() => join(userFilesPath.value, 'docker_services/aeneas/docker-compose.yaml'))
const ytdlpDockerComposePath = computed(() => join(userFilesPath.value, 'docker_services/ytdlp/docker-compose.yaml'))
const ffmpegDockerComposePath = computed(() => join(userFilesPath.value, 'docker_services/ffmpeg/docker-compose.yaml'))

const gptSoVItsApi = "http://127.0.0.1:9880/"; //gpt-sovits的api访问地址
const YOUTUBE_DATA_API_KEY = 'AIzaSyBkPEp-9_9T4PBwAYKks1A4-xoBlJs4n8s';

const novels = ref<Novel[]>([]);
let novelContentInput = ref(''); //小说内容插入框
let fqNovelBookIdInput = ref(''); //番茄小说内容
let audioTotaDuration = computed(() => novels.value.reduce((total, novel) => total + novel.audioDuration, 0)); //总音频长度

let youtubeUrl = ref('https://www.youtube.com/@HydraulicPressChannel'); //默认博主主页
let videoTotalDuration = ref(0); //视频总长度
let randomVideoCount = ref(50); //随机视频数量
let channelId = ref('UCcMDMoNu66_1Hwi5-MeiQgw'); //默认的博主id
let videoIds = ref([]); // 视频 URL 列表
let selectedVideos = ref<{ url: string, duration: number, id: string }[]>([]); // 已选视频列表
let bgminput = ref('');



let gptFile = ref(''); //gpt模型文件路径
let vitsFile = ref(''); //vits模型文件路径
let promptAudio = ref(''); //参考音频路径



const fetchNovels = async () => {
    novels.value = await ipcRenderer.invoke('selectAllNovels');
};


const deleteNovel = async (id: number) => {
    await ipcRenderer.invoke('deleteNovel', id);
    await fetchNovels();
};

//修改参考音频
watch(promptAudio, async (newValue) => {
    const response = await axios.post(`${gptSoVItsApi}change_refer`, {
        refer_wav_path: newValue.replace(/\\/g, '/'),
        prompt_text: newValue?.split('\\').pop()?.replace('.wav', ''),
        prompt_language: 'zh'
    });
    if (response.status === 200) {
        console.log(`修改参考音频成功： ${newValue}`);
    } else {
        console.error(`修改参考音频失败 ${response.status}`);
    }
});
//检查docker是否运行，如果没有运行则启动
const checkAndOpenDocker = () => {
    exec('docker info', (error, stdout, stderr) => {
        if (error) {
            console.log('Docker is not running, trying to start...');
            exec('"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error starting Docker: ${error}`);
                    return;
                }
                console.log('Docker started successfully');
            });
        } else {
            console.log('Docker is already running');
        }
    });
};
//开启gptsovits
const startGptsovitsDocker = () => {
    runDocker('gptsovits', gptsovitsDockerComposePath.value, ['up'], 'gptsovits已启动');
};
//关闭gptsovits
const stopGptsovitsDocker = () => {
    runDocker('gptsovits', gptsovitsDockerComposePath.value, ['stop'], 'gptsovits已关闭');
};
//设置模型
const setModel = async () => {
    await axios.post(`${gptSoVItsApi}set_model`, {
        gpt_model_path: gptFile.value.replace(/\\/g, '/'),
        sovits_model_path: vitsFile.value.replace(/\\/g, '/')
    }).then((response) => {
        console.log(response.data);
    });
};
//单独生成语音
const generateAudioByIndex = async (id: number) => {
    //去除“”去除空行
    let novel = await ipcRenderer.invoke('selectNovelById', id, 0);
    let text = novel.content.replace(/^\s*[\r\n]/gm, '');
    let response = await fetch(gptSoVItsApi, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: text,
            text_language: 'zh'
        })
    });
    if (response.status === 200) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        let audioSrc = join(outputPath.value, `audio-${Date.now()}.wav`);
        await fs.promises.writeFile(audioSrc, buffer);
        await ipcRenderer.invoke('updateNovelAudioSrc', id, audioSrc);
        await fetchNovels();
    } else {
        console.error('请求失败，状态码：', response.status);
    }
}
//一键生成语音
const generateAudio = async () => {
    for (let novel of novels.value) {
        if (novel.audioSrc === '') {
            console.log(`正在生成语音：${novel.content}`);
            await generateAudioByIndex(novel.id!);
        }
    }
};
//生成语音文件列表
const generateAudioListTxt = async () => {
    const audios = novels.value.map(content => {
        let match = content.audioSrc.match(/audio-\d+\.wav/);
        return match ? `file ${match[0]}` : '';
    }).filter(audio => audio !== '').join('\n');
    fs.writeFileSync(join(outputPath.value, 'audios.txt'), audios);
    console.log('成功写入文件：audios.txt');
};
//更新音频时长
const setAudioDuration = async (id: number, $event: Event) => {
    const duration = ($event.target as HTMLAudioElement).duration;
    await ipcRenderer.invoke('updateNovelAudioDuration', id, duration);
    await fetchNovels();
};
//合成视频
const generateVideo = async () => {
    await generateAudioListTxt(); //生成音频列表
    //去除标点符号，。,.“”去除空行
    let txt = novels.value.map(item => item.content).join('\n').replace(/[,，.。]/g, "\n").replace(/“|”/g, '').replace(/^\s*[\r\n]/gm, '')
    try {
        fs.writeFileSync(join(outputPath.value, 'text.txt'), txt);
        console.log('已成功写入text.txt');
    } catch (err) {
        console.error('写入文件时text.txt发生错误:', err);
        return;
    }
    const commandSynthesizeAudio = [
        'run',
        '--rm',
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "/app/audios.txt",
        "-c:a",
        "pcm_s16le",
        "/app/audio.wav"
    ]
    const commandGenerateVideo = [
        'run',
        '--rm',
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "/app/videos.txt",
        "-i",
        "/app/audio.wav",
        "-stream_loop",
        "-1",
        "-i",
        "/app/bgm.wav",
        "-filter_complex",
        "[2:a]volume=0.07[bgm]; [1:a][bgm]amix=inputs=2:duration=first[a]",
        "-map",
        "0:v",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-vf",
        "scale=-1:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,subtitles=/app/output.srt:force_style='FontName=Noto Sans CJK SC,FontSize=25,PrimaryColour=&H00FFFF&,WrapStyle=0'",
        "-t",
        audioTotaDuration.value.toString(),  // 替换为你的音频总时长
        "/app/output.mp4"
    ]
    await runDocker('音频合成', ffmpegDockerComposePath.value, commandSynthesizeAudio, '音频合成完毕');
    await runDocker('生成字幕', aeneasDockerComposePath.value, ['up'], '生成字幕完毕');
    await runDocker('视频合成', ffmpegDockerComposePath.value, commandGenerateVideo, '视频合成完毕');
};
//docker-compose通用方法
const runDocker = async (dockerName: string, dockerComposePath: string, command: string[], msg: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const docker = spawn('docker-compose', ['-f', dockerComposePath, ...command]);

        docker.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        docker.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        docker.on('close', (code) => {
            console.log(`${dockerName}|子进程退出，退出码 ${code}`);
            console.log(msg);
            resolve();
        });

        docker.on('error', (err) => {
            console.error(`启动子进程时发生错误: ${err}`);
            reject(err);
        });
    });
};
//切换youtube博主url
const toggleYoutubeUrl = async () => {
    // 获取YouTube频道ID
    const response = await axios.get(youtubeUrl.value);
    const html = response.data;
    const match = html.match(/<meta itemprop="identifier" content="(.*?)">/);
    channelId.value = match ? match[1] : null;
};
//展示视频
const showVideo = async () => {
    const url = 'https://www.googleapis.com/youtube/v3/search';
    const params = {
        key: YOUTUBE_DATA_API_KEY,
        channelId: channelId.value,
        part: 'snippet',
        type: 'video',
        order: 'date',
        maxResults: randomVideoCount.value,
    };
    try {
        const response = await axios.get(url, {
            params: params,
            headers: {
                'Accept': 'application/json'
            }
        });
        const data = response.data;
        videoIds.value = data.items.map((item: any) => item.id.videoId);
        while (videoTotalDuration.value < audioTotaDuration.value) {
            await selectVideo();
        }
    } catch (error) {
        console.error('获取video IDs失败:', error)
    }
};
//根据id获取视频时常
const getYoutubeVideoDuration = async (videoId: string) => {
    const url = 'https://www.googleapis.com/youtube/v3/videos';
    const params = {
        key: YOUTUBE_DATA_API_KEY,
        id: videoId,
        part: 'contentDetails', //part 参数用于指定你希望 API 返回哪些视频的属性。
    };

    try {
        const response = await axios.get(url, {
            params: params,
            headers: {
                'Accept': 'application/json'
            }
        });
        const data = response.data;
        const duration = data.items[0].contentDetails.duration;
        return durationToSeconds(duration);
    } catch (error) {
        console.error('获取视频时长失败:', error)
    }
}
//ISO 8601 转 秒
const durationToSeconds = (duration: string) => {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (match) {
        const hours = (parseInt(match[1]) || 0);
        const minutes = (parseInt(match[2]) || 0);
        const seconds = (parseInt(match[3]) || 0);

        return hours * 3600 + minutes * 60 + seconds;
    } else {
        return 0;
    }
}
// 随机选择视频
const selectVideo = async () => {
    const index = Math.floor(Math.random() * videoIds.value.length);
    const selectedVideoId = videoIds.value.splice(index, 1)[0]; //随机出一个视频id
    const selectedVideoDuration = await getYoutubeVideoDuration(selectedVideoId); //获取视频的时长
    selectedVideos.value.push({
        url: 'https://www.youtube.com/watch?v=' + selectedVideoId,
        duration: selectedVideoDuration!,
        id: selectedVideoId
    });
    videoTotalDuration.value += selectedVideoDuration!;
    if (videoTotalDuration.value < audioTotaDuration.value) {
        await selectVideo();
    }
};
// 删除视频
const removeVideo = async (index: number) => {
    const removedVideoDuration = selectedVideos.value[index].duration;
    selectedVideos.value.splice(index, 1);
    videoTotalDuration.value -= removedVideoDuration;
    if (videoTotalDuration.value < audioTotaDuration.value) {
        await selectVideo();
    }
};
//下载视频
const downloadVideos = async () => {
    // 删除 outputPath 下所有以 'video-' 开头的文件
    fs.readdirSync(outputPath.value).forEach(file => {
        if (file.startsWith('video-')) {
            fs.unlinkSync(join(outputPath.value, file));
            console.log(`成功删除文件：${file}`);
        }
    });

    for (const video of selectedVideos.value) {
        console.log(`正在下载视频：${video.url}`);
        const command = ['run', '--rm', 'yt-dlp', '--no-playlist', '-f', 'bestvideo[ext=mp4]/best[ext=mp4]', '-o', '/app/video-%(id)s.%(ext)s', video.url];
        await runDocker('下载背景音乐', ytdlpDockerComposePath.value, command, '背景音乐下载完毕');
    }
    console.log('所有视频都已经下载完成。');

    // 获取 outputPath 下所有以 'video-' 开头的文件，并写入到 'videos.txt'
    const videos = fs.readdirSync(outputPath.value).filter(file => file.startsWith('video-')).map(file => `file ${file}`).join('\n');
    fs.writeFileSync(join(outputPath.value, 'videos.txt'), videos);
    console.log('成功写入文件：videos.txt');
};
//下载背景音乐
const onEnter = async () => {
    const command = ['run', '--rm', 'yt-dlp', '-x', '--no-continue', '-o', `/app/bgm.wav`, bgminput.value];
    await runDocker('下载背景音乐', ytdlpDockerComposePath.value, command, '背景音乐下载完毕');
}
//添加小说
const addNovel = async () => {
    const novelData: Novel = {
        content: novelContentInput.value,
        audioSrc: '',
        audioDuration: 0
    };
    await ipcRenderer.invoke('insertNovel', novelData);
    await fetchNovels();
};

const fetchfqNovelContent = async () => {
    if (!fqNovelBookIdInput) {
        return;
    }

    const response = await axios.get(`https://fqnovel.pages.dev/content?item_id=${fqNovelBookIdInput.value}`);
    const parser = new DOMParser();
    const doc = parser.parseFromString(response.data, 'text/html');
    const paragraphs = Array.from(doc.getElementsByTagName('p'));
    console.log(paragraphs);
    for (const p of paragraphs) {
        console.log(p.textContent);
        const novelData: Novel = {
            content: p.textContent!,
            audioSrc: '',
            audioDuration: 0
        };
        await ipcRenderer.invoke('insertNovel', novelData);
    }
    await fetchNovels();
}

const truncateNovel = async () => {
    await ipcRenderer.invoke('truncateNovelTable');
    await fetchNovels();
}

</script>

<template>
    <div :style="{ backgroundColor: 'pink' }">
        <input v-model="fqNovelBookIdInput"></input>
        <button @click="fetchfqNovelContent">确定</button>
    </div>
    <VueDraggable v-model="novels" target=".sort-target" :animation="150">
        <table>
            <thead>
                <tr>
                    <th><textarea v-model="novelContentInput"></textarea></th>
                    <th><button @click="addNovel">添加</button></th>
                    <th><button @click="generateAudio">一键生成语音</button></th>
                    <th><button @click="truncateNovel">清空表</button></th>
                </tr>
                <tr>
                    <th>id</th>
                    <th>内容</th>
                    <th>音频源</th>
                    <th>音频时长</th>
                    <th>音频</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody class="sort-target">
                <tr v-for="novel in novels" :key="novel.id" class="cursor-move">
                    <td>{{ novel.id }}</td>
                    <td>{{ novel.content }}</td>
                    <td>{{ novel.audioSrc }}</td>
                    <td>{{ novel.audioDuration }}</td>
                    <td><audio @loadedmetadata="setAudioDuration(novel.id!, $event)" :src="novel.audioSrc"
                            controls></audio></td>
                    <td>
                        <div style="display: flex;">
                            <button @click="deleteNovel(novel.id!)">删除</button>
                            <button @click="generateAudioByIndex(novel.id!)">生成语音</button>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </VueDraggable>


    <div :style="{ backgroundColor: 'gray' }">
        <div>
            <button @click="startGptsovitsDocker">开启gpt-sovits</button>
            <button @click="stopGptsovitsDocker">关闭gpt-sovits</button>
        </div>
        <selectFIle :buttonValue="'vits文件:'" :directory="gptsovitsModelPath" v-model="vitsFile" />
        <selectFIle :buttonValue="'gpt文件:'" :directory="gptsovitsModelPath" v-model="gptFile" />
        <button @click="setModel">设置模型</button>
        <selectFIle :buttonValue="'参考音频:'" :directory="gptsovitsModelPath" v-model="promptAudio" />
    </div>

    <div :style="{ backgroundColor: 'gray' }">
        <div class="info">
            <p>音频长度:{{ audioTotaDuration }}</p>
            <p>视频总长度:{{ videoTotalDuration }}</p>
            <p>选择的博主id:{{ channelId }}</p>
        </div>
        <div class="controls">
            <p>选择博主视频主页:<input @keyup.enter="toggleYoutubeUrl" type="text" id="youtubeUrlInput" v-model="youtubeUrl">
            </p>
            <p>选择随机视频数量:<input type="number" id="randomVideoCountInput" v-model="randomVideoCount"></p>
            <p>请输入音频地址，按回车键下载:<input v-model="bgminput" @keyup.enter="onEnter"></input></p>
            <button @click="showVideo">展示视频</button>
            <button @click="downloadVideos">下载视频</button>
        </div>
        <div>
            <a :style="{ display: 'block' }" v-for="(video, index) in selectedVideos" :key="index" :href="video.url"
                @contextmenu.prevent="removeVideo(index)">{{ video.id }} (时长：{{ video.duration }})</a>
        </div>
    </div>

    <div>
        <button @click="generateVideo()">合成视频</button>
    </div>

</template>

<style scoped>
/* 按钮样式 */
button {
    display: inline-block;
    padding: 10px 20px;
    background-color: #007BFF;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
}

button:hover {
    background-color: #0056b3;
}
</style>