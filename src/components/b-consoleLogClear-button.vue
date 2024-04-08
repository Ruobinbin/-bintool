<template>
    <button class="clear-console-button" @click="clearConsole">清空控制台</button>
</template>

<script setup lang="ts">
const clearConsole = () => {
    console.clear();
};
</script>

<style scoped>
.clear-console-button {
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
}
</style>