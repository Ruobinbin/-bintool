<script setup lang="ts">
import { onMounted, ref } from 'vue';

let inputElement = ref<HTMLInputElement | null>(null);
const inputValue = ref('');

window.ipcRenderer.on('win-show', () => {
  if (inputElement.value) {
    inputElement.value.select();
  }
})

onMounted(() => {
  if (inputElement.value) {
    inputElement.value.focus();
  }
});



//按下回车后触发
const onEnter = () => {
  switch (inputValue.value) {
    case '/dm':
      console.log('Option 1 selected');
      break;
    case '/dg':
      console.log('Option 2 selected');
      break;
    case '/xs':
      console.log('Option 2 selected');
      window.ipcRenderer.send('open-novel-win', 'src/novel/novel.html');
      break;
    default:
      console.log('Other option selected');
  }
}



</script>

<template>
  <input @keyup.enter="onEnter" ref="inputElement" v-model="inputValue" class="input-field" placeholder="请输入内容" />
</template>

<style>
.input-field {
  width: 70%;
  padding: 10px 20px;
  font-size: 18px;
  border: none;
  border-radius: 50px;
  box-shadow: 0 0 15px 4px rgba(0, 0, 0, 0.06);
  margin: auto;
  display: block;
}

.input-field:focus {
  outline: none;
}
</style>
