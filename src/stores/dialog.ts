import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface DialogButton<T> {
  label: string;
  value: T;
  primary?: boolean;
}

interface OpenDialog {
  message: string;
  buttons: DialogButton<unknown>[];
  resolve: (value: unknown) => void;
}

/** In-page confirmation dialogs (window.confirm is unavailable in sandboxed frames). */
export const useDialogStore = defineStore('dialog', () => {
  const current = ref<OpenDialog | null>(null);

  function ask<T>(message: string, buttons: DialogButton<T>[]): Promise<T> {
    return new Promise<T>((resolve) => {
      current.value = { message, buttons, resolve: resolve as (v: unknown) => void };
    });
  }

  function answer(value: unknown): void {
    const d = current.value;
    current.value = null;
    d?.resolve(value);
  }

  return { current, ask, answer };
});
