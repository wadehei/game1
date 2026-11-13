<template>
  <div class="hand-container">
    <div class="cards-wrapper">
      <CardItem
        v-for="(card, index) in cards"
        :key="card.id"
        :card="card"
        :selected="selectedIds.includes(card.id)"
        :width="cardWidth"
        :height="cardHeight"
        :style="{ marginLeft: index > 0 ? `-${overlap}px` : '0' }"
        @click="toggleSelect(card)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Card } from '../utils/types';
import CardItem from './CardItem.vue';

const props = withDefaults(
  defineProps<{
    cards: Card[];
    selectedIds: number[];
    cardWidth?: number;
    cardHeight?: number;
    overlap?: number;
    selectable?: boolean;
  }>(),
  {
    cardWidth: 60,
    cardHeight: 84,
    overlap: 20,
    selectable: true,
  }
);

const emit = defineEmits<{
  (e: 'select', card: Card): void;
  (e: 'deselect', card: Card): void;
}>();

const toggleSelect = (card: Card) => {
  if (!props.selectable) return;

  if (props.selectedIds.includes(card.id)) {
    emit('deselect', card);
  } else {
    emit('select', card);
  }
};
</script>

<style scoped>
.hand-container {
  display: flex;
  justify-content: center;
  padding: 10px 0;
}

.cards-wrapper {
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
</style>
