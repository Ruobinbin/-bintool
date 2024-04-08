<script setup lang="ts">
import { ipcRenderer } from 'electron';
import { ref } from 'vue';
import { join, relative } from 'path';

const props = defineProps({
    buttonValue: String,
    directory: String,
    modelValue: String
});

const emit = defineEmits(['update:modelValue']);

const selectedFile = ref(props.modelValue);

const select = async () => {
    const result = await ipcRenderer.invoke('open-file-dialog', props.directory);
    if (result) {
        selectedFile.value = relative(join(props.directory || '', "../"), result);
        emit('update:modelValue', selectedFile.value);
    }
};

</script>

<template>
    <button class="styled-button" @click="select">{{ buttonValue }}{{ selectedFile }}</button>
</template>

<style scoped></style>