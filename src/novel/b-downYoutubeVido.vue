<script setup lang="ts">
import axios from 'axios';
import { ref } from 'vue';
import { spawn } from 'child_process';
import { readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';


const props = defineProps({
    audioDuration: Number, //音频长度
    ytdlpDockerComposePath: String, //ytdlp docker-compose.yaml 路径
    outputPath: String, //输出路径
});

const YOUTUBE_DATA_API_KEY = 'AIzaSyBkPEp-9_9T4PBwAYKks1A4-xoBlJs4n8s';

let youtubeUrl = ref('https://www.youtube.com/@HydraulicPressChannel'); //默认博主主页
let videoTotalDuration = ref(0); //视频总长度
let randomVideoCount = ref(50); //随机视频数量
let channelId = ref('UCcMDMoNu66_1Hwi5-MeiQgw'); //默认的博主id
let videoIds = ref([]); // 视频 URL 列表
let selectedVideos = ref<{ url: string, duration: number, id: string }[]>([]); // 已选视频列表
let inputValue = ref('');

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
        while (videoTotalDuration.value < props.audioDuration!) {
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
    if (videoTotalDuration.value < props.audioDuration!) {
        await selectVideo();
    }
};
// 删除视频
const removeVideo = async (index: number) => {
    const removedVideoDuration = selectedVideos.value[index].duration;
    selectedVideos.value.splice(index, 1);
    videoTotalDuration.value -= removedVideoDuration;
    if (videoTotalDuration.value < props.audioDuration!) {
        await selectVideo();
    }
};
//下载视频
const downloadVideos = async () => {
    // 删除 outputPath 下所有以 'video-' 开头的文件
    readdirSync(props.outputPath!).forEach(file => {
        if (file.startsWith('video-')) {
            unlinkSync(join(props.outputPath!, file));
            console.log(`成功删除文件：${file}`);
        }
    });

    for (const video of selectedVideos.value) {
        console.log(`正在下载视频：${video.url}`);
        await new Promise<void>((resolve, reject) => {
            const docker = spawn('docker-compose', ['-f', props.ytdlpDockerComposePath!, 'run', '--rm', 'yt-dlp', '--no-playlist', '-f', 'bestvideo[ext=mp4]/best[ext=mp4]', '-o', '/app/video-%(id)s.%(ext)s', video.url]);
            docker.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });

            docker.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });

            docker.on('close', (code) => {
                console.log(`子进程退出，退出码 ${code}`);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Docker exited with code ${code}`));
                }
            });
        });
    }
    console.log('所有视频都已经下载完成。');

    // 获取 outputPath 下所有以 'video-' 开头的文件，并写入到 'videos.txt'
    const videos = readdirSync(props.outputPath!).filter(file => file.startsWith('video-')).map(file => `file ${file}`).join('\n');
    writeFileSync(join(props.outputPath!, 'videos.txt'), videos);
    console.log('成功写入文件：videos.txt');
};
//下载背景音乐
const onEnter = () => {
    const docker = spawn('docker-compose', ['-f', props.ytdlpDockerComposePath!, 'run', '--rm', 'yt-dlp', '-x', '--no-continue', '-o', `/app/bgm.wav`, inputValue.value]);
    docker.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    docker.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    docker.on('close', (code) => {
        console.log(`子进程退出，退出码 ${code}`);
    });
}

</script>

<template>
    <div class="container">
        <div class="info">
            <span>音频长度:{{ $props.audioDuration }}</span>
            <span>视频总长度:{{ videoTotalDuration }}</span>
            <span>选择的博主id:{{ channelId }}</span>
        </div>
        <div class="controls">
            <span>选择博主视频主页:<input @keyup.enter="handleEnter" type="text" id="youtubeUrlInput"
                    v-model="youtubeUrl"></span>
            <span>选择随机视频数量:<input type="number" id="randomVideoCountInput" v-model="randomVideoCount"></span>
            <button @click="showVideo">展示视频</button>
            <button @click="downloadVideos">下载视频</button>
            <input placeholder="请输入音频地址，按回车键下载" v-model="inputValue" @keyup.enter="onEnter"></input>
        </div>
        <div class="video-list">
            <a v-for="(video, index) in selectedVideos" :key="index" :href="video.url"
                @contextmenu.prevent="removeVideo(index)">{{ video.id }} (时长：{{ video.duration }})</a>
        </div>
    </div>
</template>

<style scoped>
a {
    display: block;
}

.container {
    font-family: Arial, sans-serif;
    padding: 20px;
    background-color: #859db4;
    /* 添加这一行 */
}

.info,
.controls {
    margin-bottom: 20px;
}

.info span,
.controls span {
    display: block;
    margin-bottom: 10px;
}

.controls input {
    margin-left: 10px;
    width: 50%;
}

.controls button {
    display: inline-block;
    margin-top: 10px;
    padding: 10px 20px;
    background-color: #007BFF;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
}

.controls button:hover {
    background-color: #0056b3;
}

.video-list a {
    display: block;
    margin-bottom: 10px;
    color: #007BFF;
    text-decoration: none;
}

.video-list a:hover {
    color: #0056b3;
}
</style>