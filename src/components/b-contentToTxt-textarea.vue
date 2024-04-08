<script setup lang="ts">
import { ref, watch } from 'vue';
import { readFile, writeFile } from 'fs/promises';

const props = defineProps({
    src: String,
    content: String
});

const content = ref('');

const emit = defineEmits(['update:content']);

const getFileContent = async () => {
    if (props.src) {
        try {
            const fileContent = await readFile(props.src, 'utf-8');
            content.value = fileContent;
        } catch (error) {
            console.error(`读取文件错误: ${error}`);
        }
    } else {
        console.error('文件路径未定义');
    }
}
getFileContent()

watch(() => props.content, async (newContent) => {
    if (!newContent) {
        return
    }
    content.value = newContent;
    if (props.src) {
        try {
            await writeFile(props.src, newContent, 'utf-8');
            console.log('文件写入成功: ', props.src);
        } catch (error) {
            console.error(`写入文件错误: ${error}`);
        }
    } else {
        console.error('文件路径未定义');
    }
});


// 当 textarea 的内容改变时，告诉父组件修改值
watch(content, async (newContent) => {
    emit('update:content', newContent);
});
</script>

<template>
    <textarea v-model="content"></textarea>
</template>

<style scoped>
textarea {
    width: 100%;
    height: 200px;
    padding: 10px;
    box-sizing: border-box;
    font-size: 16px;
    line-height: 1.5;
    border-radius: 4px;
    border: 1px solid #ccc;
    background-color: #f8f8f8;
    resize: vertical;
    /* 允许用户垂直调整 textarea 的大小 */
}
</style>