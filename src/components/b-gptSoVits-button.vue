<script setup lang="ts">
import { ref, watch } from 'vue';
import { spawn } from 'child_process';
import { join } from 'path';
import selectFIle from "../components/b-selectFIle-button.vue"
import axios from 'axios';
import { promises } from 'fs';

const props = defineProps({
    text: String,
    audioPath: String,
    dockerPath: String
});

const modelPath = join(props.dockerPath!, 'model');
const dockerComposePath = join(props.dockerPath!, 'docker-compose.yaml');
const gptSoVItsApi = "http://127.0.0.1:9880/"

const audioPlayer = ref<HTMLAudioElement>();

const gptFile = ref('');
const vitsFile = ref('');
const promptAudio = ref('');

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
//设置模型
const setModel = async () => {
    await axios.post(`${gptSoVItsApi}set_model`, {
        gpt_model_path: gptFile.value.replace(/\\/g, '/'),
        sovits_model_path: vitsFile.value.replace(/\\/g, '/')
    }).then((response) => {
        console.log(response.data);
    });
};
//生成语音
const generateAudio = async () => {
    if (!props.text) {
        console.log('文本不能为空');
        return;
    }
    if (!props.audioPath) {
        console.log('路径不能为空');
        return;
    }
    const response = await fetch(gptSoVItsApi, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: props.text,
            text_language: 'zh'
        })
    });
    if (response.status === 200) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await promises.writeFile(props.audioPath, buffer);
        console.log('生成音频成功');
        audioPlayer.value!.src = props.audioPath;
        audioPlayer.value!.load();
    } else {
        console.error('请求失败，状态码：', response.status);
    }
};
//开启容器
const start = () => {
    const dockerCompose = spawn('docker-compose', ['-f', dockerComposePath, 'up']);

    dockerCompose.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    dockerCompose.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    dockerCompose.on('close', (code) => {
        console.log(`子进程退出，退出码 ${code}`);
    });
};
//关闭容器
const stop = () => {
    const dockerCompose = spawn('docker-compose', ['-f', dockerComposePath, 'stop']);

    dockerCompose.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    dockerCompose.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    dockerCompose.on('close', (code) => {
        console.log(`子进程退出，退出码 ${code}`);
    });
}
</script>

<template>
    <div class="container">
        <div class="row">
            <button class="btn" @click="start">开启gpt-sovits</button>
            <button class="btn" @click="stop">关闭gpt-sovits</button>
            <button class="btn" @click="setModel">设置模型</button>
            <button class="btn" @click="generateAudio">生成语音</button>
        </div>
        <selectFIle class="row" :buttonValue="'gpt文件:'" :directory="modelPath" v-model="gptFile" />
        <selectFIle class="row" :buttonValue="'vits文件:'" :directory="modelPath" v-model="vitsFile" />
        <selectFIle class="row" :buttonValue="'参考音频:'" :directory="modelPath" v-model="promptAudio" />
        <audio ref="audioPlayer" :src="props.audioPath" controls></audio>
    </div>
</template>

<style scoped>
.container {
    background-color: rgb(211, 211, 211);
    display: flex;
    flex-direction: column;
    align-items: stretch;
}

.row {
    margin-bottom: 10px;
}

.btn {
    background-color: #4CAF50;
    /* Green */
    border: none;
    color: white;
    padding: 15px 32px;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    font-size: 16px;
    margin: 4px 2px;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.3s ease;
}

.btn:hover {
    background-color: #45a049;
}

audio {
    width: 100%;
}
</style>