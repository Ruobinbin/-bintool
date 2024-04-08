<script setup lang="ts">
import { exec } from 'child_process';

const openDocker = () => {
    exec('"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"', (error, stdout, stderr) => {
        if (error) {
            console.error(`执行的错误: ${error}`);
            return;
        }
    });
};

</script>

<template>
    <button class="docker-button" @click="openDocker">打开docker</button>
</template>

<style scoped>
.docker-button {
    padding: 10px 20px;
    font-size: 16px;
    color: white;
    background-color: #007BFF;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s ease;
}

.docker-button:hover {
    background-color: #0056b3;
}
</style>