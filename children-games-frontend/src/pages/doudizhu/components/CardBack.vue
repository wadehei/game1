<template>
  <div class="card-back" :style="{ width: `${width}px`, height: `${height}px` }">
    <div class="card-back-face">
      <div class="pattern"></div>
      <div class="center-decor">
        <span class="star">★</span>
      </div>
      <div class="border-decor"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    width?: number;
    height?: number;
  }>(),
  {
    width: 40,
    height: 56,
  }
);
</script>

<style scoped>
.card-back {
  position: relative;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.card-back-face {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1565c0 100%);
  border: 1px solid #0d47a1;
  overflow: hidden;
}

.pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.3) 1.5px, transparent 1.5px);
  background-size: 8px 8px;
}

.border-decor {
  position: absolute;
  inset: 3px;
  border: 1px dashed rgba(255, 255, 255, 0.4);
  border-radius: 2px;
}

.center-decor {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.star {
  color: rgba(255, 255, 255, 0.8);
  font-size: 10px;
}
</style>
