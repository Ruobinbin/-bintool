<script setup lang="ts">
import openDocker from "../components/b-openDocker-button.vue"
import contentToTxt from "../components/b-contentToTxt-textarea.vue"
import consoleLogClear from "../components/b-consoleLogClear-button.vue"
import gptSoVits from "../components/b-gptSoVits-button.vue"
import { join } from 'node:path'
import { inject, ref, watch } from "vue"

const publicPath = inject('publicPath') as string;
const txtPath = join(publicPath, 'output/text.txt');
const audioPath = join(publicPath, 'output/audio.wav');
const dockerPath = join(publicPath, 'docker_services/gpt-sovits');;
const novelContent = ref('你好呀')

watch(novelContent, (newContent) => {
    //去掉空行
    novelContent.value = newContent.replace(/^\s*[\r\n]/gm, '');
    console.log(novelContent.value);
});

</script>

<template>
    <contentToTxt :src="txtPath" v-model:content="novelContent"></contentToTxt>
    <consoleLogClear />
    <openDocker />
    <gptSoVits :dockerPath="dockerPath" :audioPath="audioPath" :text="novelContent" />
</template>

<style></style>