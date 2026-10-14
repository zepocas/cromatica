import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { readShareHash } from './ui/share-link';

// A shared link is decoded before the first paint, so the app opens on it without showing the autosave first.
const { design, failed } = await readShareHash(location.hash);

const app = mount(App, {
  target: document.getElementById('app')!,
  props: { shared: design, shareFailed: failed },
});

export default app;
