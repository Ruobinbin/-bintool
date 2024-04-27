<script setup lang="ts">
import consoleLogClear from "../components/b-consoleLogClear-button.vue"
import downYoutubeVideo from "./b-downYoutubeVido.vue"
import selectFIle from "../components/b-selectFIle-button.vue"

import { join } from 'node:path'
import { computed, inject, ref, watch } from "vue"
import { spawn, exec } from 'child_process';
import axios from 'axios';
import fs from 'fs';

const publicPath = inject('publicPath') as string; //public的路径
const outputPath = join(publicPath, 'output');

const gptsovitsModelPath = join(publicPath, 'docker_services/gpt-sovits/model');
const gptsovitsDockerComposePath = join(publicPath, 'docker_services/gpt-sovits/docker-compose.yaml');
const aeneasDockerComposePath = join(publicPath, 'docker_services/aeneas/docker-compose.yaml');
const ytdlpDockerComposePath = join(publicPath, 'docker_services/ytdlp/docker-compose.yaml');
const ffmpegDockerComposePath = join(publicPath, 'docker_services/ffmpeg/docker-compose.yaml');

const gptSoVItsApi = "http://127.0.0.1:9880/"; //gpt-sovits的api访问地址
const YOUTUBE_DATA_API_KEY = 'AIzaSyBkPEp-9_9T4PBwAYKks1A4-xoBlJs4n8s';

let novelTextarea = ref(''); //小说内容
let contents = ref<{ content: string, audioSrc: string, audioDuration: number }[]>([]);
let audioTotaDuration = computed(() => contents.value.reduce((total, novel) => total + novel.audioDuration, 0));

let youtubeUrl = ref('https://www.youtube.com/@HydraulicPressChannel'); //默认博主主页
let videoTotalDuration = ref(0); //视频总长度
let randomVideoCount = ref(50); //随机视频数量
let channelId = ref('UCcMDMoNu66_1Hwi5-MeiQgw'); //默认的博主id
let videoIds = ref([]); // 视频 URL 列表
let selectedVideos = ref<{ url: string, duration: number, id: string }[]>([]); // 已选视频列表
let inputValue = ref('');

let gptFile = ref(''); //gpt模型文件路径
let vitsFile = ref(''); //vits模型文件路径
let promptAudio = ref(''); //参考音频路径

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
watch(novelTextarea, async (newValue) => {
    novelTextarea.value = newValue.replace(/<p>(.*?)<\/p>/g, (match, p1) => `${p1}\n`);
});
//初始化contents
const initContents = async () => {
    const files = await fs.promises.readdir(outputPath);
    for (let i = 0; i < files.length; i++) {
        if (files[i].startsWith('audio-')) {
            const audioSrc = join(outputPath, files[i]);
            let content = '暂无';
            try {
                const index = files[i].split('-')[1].split('.')[0]; // 获取文件名中的索引
                content = await fs.promises.readFile(join(outputPath, `content-${index}.txt`), 'utf-8'); // 读取对应的txt文件的内容
            } catch (err) {
                console.error('Error while reading file', err);
            }
            contents.value.push({
                content: content,
                audioSrc: audioSrc,
                audioDuration: 0
            });
        }
    }
};
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
//添加小说id输入框
const addNovelInput = () => {
    contents.value.push({
        content: '暂无',
        audioSrc: "",
        audioDuration: 0
    });
}
//删除小说id输入框
const rmNovle = (index: number) => {
    if (contents.value[index].audioSrc === '') {
        contents.value.splice(index, 1);
        return;
    }
    let audioSrc = contents.value[index].audioSrc.split('?')[0]; // 获取问号之前的部分
    try {
        fs.unlinkSync(audioSrc);
        fs.unlinkSync(audioSrc.replace('audio', 'content').replace('wav', 'txt'));
        console.log(`${audioSrc} deleted successfully`);
    } catch (err) {
        console.error('Error while deleting file', err);
    }
    contents.value.splice(index, 1);
}
//设置contents的内容
const addNovelToContents = () => {
    const lines = novelTextarea.value.split('\n');
    lines.forEach(content => {
        contents.value.push({ content, audioSrc: '', audioDuration: 0 });
    });
}
//开启gptsovits
const startGptsovitsDocker = () => {
    runDocker('gptsovits', gptsovitsDockerComposePath, ['up'], 'gptsovits已启动');
};
//关闭gptsovits
const stopGptsovitsDocker = () => {
    runDocker('gptsovits', gptsovitsDockerComposePath, ['stop'], 'gptsovits已关闭');
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
const generateAudioByIndex = async (index: number) => {
    //去除“”去除空行
    let text = contents.value[index].content.replace(/^\s*[\r\n]/gm, '');
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
        await fs.promises.writeFile(join(outputPath, `audio-${index}.wav`), buffer);
        await fs.promises.writeFile(join(outputPath, `content-${index}.txt`), text);
        contents.value[index].audioSrc = join(outputPath, `audio-${index}.wav?${Date.now()}`)
    } else {
        console.error('请求失败，状态码：', response.status);
    }
}
//一键生成语音
const generateAudio = async () => {
    if (contents.value.length === 0) {
        alert('请添加小说');
        return;
    }
    for await (let [index, content] of contents.value.entries()) {
        if (content.audioSrc !== '') {
            continue;
        }
        await generateAudioByIndex(index);
    }
};
//生成语音文件列表
const generateAudioListTxt = async () => {
    const audios = contents.value.map(content => {
        let match = content.audioSrc.match(/audio-\d+\.wav/);
        return match ? `file ${match[0]}` : '';
    }).filter(audio => audio !== '').join('\n');
    fs.writeFileSync(join(outputPath, 'audios.txt'), audios);
    console.log('成功写入文件：audios.txt');
};
//更新音频时长
const setAudioDuration = (index: number, $event: Event) => {
    contents.value[index].audioDuration = ($event.target as HTMLAudioElement).duration;
};
//合成视频
const generateVideo = async () => {
    await generateAudioListTxt(); //生成音频列表
    //去除标点符号，。,.“”去除空行
    let txt = contents.value.map(item => item.content).join('\n').replace(/[,，.。]/g, "\n").replace(/“|”/g, '').replace(/^\s*[\r\n]/gm, '')
    try {
        fs.writeFileSync(join(outputPath, 'text.txt'), txt);
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
    await runDocker('音频合成', ffmpegDockerComposePath, commandSynthesizeAudio, '音频合成完毕');
    await runDocker('生成字幕', aeneasDockerComposePath, ['up'], '生成字幕完毕');
    await runDocker('视频合成', ffmpegDockerComposePath, commandGenerateVideo, '视频合成完毕');
};
const playNext = (index: number) => {
    if (index + 1 < contents.value.length) {
        const nextDiv = document.querySelector(`div[data-index='${index + 1}']`) as HTMLDivElement;
        if (nextDiv) {
            const nextAudio = nextDiv.querySelector('audio') as HTMLAudioElement;
            if (nextAudio) {
                nextAudio.play();
            }
            nextDiv.scrollIntoView({ behavior: 'smooth' });
        }
    }
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

const handleEnter = async () => {
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
    fs.readdirSync(outputPath).forEach(file => {
        if (file.startsWith('video-')) {
            fs.unlinkSync(join(outputPath, file));
            console.log(`成功删除文件：${file}`);
        }
    });

    for (const video of selectedVideos.value) {
        console.log(`正在下载视频：${video.url}`);
        const command = ['run', '--rm', 'yt-dlp', '--no-playlist', '-f', 'bestvideo[ext=mp4]/best[ext=mp4]', '-o', '/app/video-%(id)s.%(ext)s', video.url];
        await runDocker('下载背景音乐', ytdlpDockerComposePath, command, '背景音乐下载完毕');
    }
    console.log('所有视频都已经下载完成。');

    // 获取 outputPath 下所有以 'video-' 开头的文件，并写入到 'videos.txt'
    const videos = fs.readdirSync(outputPath).filter(file => file.startsWith('video-')).map(file => `file ${file}`).join('\n');
    fs.writeFileSync(join(outputPath, 'videos.txt'), videos);
    console.log('成功写入文件：videos.txt');
};
//下载背景音乐
const onEnter = async () => {
    const command = ['run', '--rm', 'yt-dlp', '-x', '--no-continue', '-o', `/app/bgm.wav`, inputValue.value];
    await runDocker('下载背景音乐', ytdlpDockerComposePath, command, '背景音乐下载完毕');
}

checkAndOpenDocker();
initContents();

</script>

<template>
    <consoleLogClear />
    <div :style="{ backgroundColor: 'pink', border: '2px solid black' }">
        <textarea v-model="novelTextarea" :style="{ width: '80%', height: '100px', display: 'block' }"></textarea>
        <button @click="addNovelToContents()">确定</button>
    </div>
    <div :style="{ backgroundColor: 'pink', border: '2px solid black' }">
        <button @click="addNovelInput">添加</button>
        <div :data-index="index" v-for="(content, index) in contents" :key="index" @contextmenu.prevent="rmNovle(index)"
            :style="{ backgroundColor: 'gray', marginTop: '10px', borderRadius: '10px', border: '2px solid black' }">
            <span>{{ index }}</span>
            <textarea v-model="contents[index].content"
                :style="{ width: '99%', height: '20px', display: 'block' }"></textarea>
            <p>{{ content.audioSrc }}</p>
            <audio @ended="playNext(index)" @loadedmetadata="setAudioDuration(index, $event)"
                :src="contents[index].audioSrc" controls></audio>
            <button @click="generateAudioByIndex(index)">生成语音</button>
        </div>
        <button @click="generateAudio">一键生成语音</button>
    </div>

    <div :style="{ backgroundColor: 'gray', border: '2px solid black' }">
        <div>
            <button @click="startGptsovitsDocker">开启gpt-sovits</button>
            <button @click="stopGptsovitsDocker">关闭gpt-sovits</button>
        </div>
        <selectFIle :buttonValue="'vits文件:'" :directory="gptsovitsModelPath" v-model="vitsFile" />
        <selectFIle :buttonValue="'gpt文件:'" :directory="gptsovitsModelPath" v-model="gptFile" />
        <button @click="setModel">设置模型</button>
        <selectFIle :buttonValue="'参考音频:'" :directory="gptsovitsModelPath" v-model="promptAudio" />
    </div>

    <div :style="{ backgroundColor: 'gray', border: '2px solid black' }">
        <div class="info">
            <p>音频长度:{{ audioTotaDuration }}</p>
            <p>视频总长度:{{ videoTotalDuration }}</p>
            <p>选择的博主id:{{ channelId }}</p>
        </div>
        <div class="controls">
            <p>选择博主视频主页:<input @keyup.enter="handleEnter" type="text" id="youtubeUrlInput" v-model="youtubeUrl"></p>
            <p>选择随机视频数量:<input type="number" id="randomVideoCountInput" v-model="randomVideoCount"></p>
            <p>请输入音频地址，按回车键下载:<input v-model="inputValue" @keyup.enter="onEnter"></input></p>
            <button @click="showVideo">展示视频</button>
            <button @click="downloadVideos">下载视频</button>
        </div>
        <div class="video-list">
            <a v-for="(video, index) in selectedVideos" :key="index" :href="video.url"
                @contextmenu.prevent="removeVideo(index)">{{ video.id }} (时长：{{ video.duration }})</a>
        </div>
    </div>

    <div>
        <button @click="generateVideo()">合成视频</button>
    </div>

</template>

<style scoped>
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