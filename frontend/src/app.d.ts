// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import 'unplugin-icons/types/svelte';
import type FrontendRenderingDataAccess from '../../src/frontend/FrontendRenderingDataAccess';

declare global {
  namespace App {
    interface Locals {
      readonly apollo: {
        readonly frontendRenderingDataAccess: FrontendRenderingDataAccess;
      };
    }

    // interface Error {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
