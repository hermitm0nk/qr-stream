/**
 * Application entry point — renders the <App/> shell into #root.
 */
import { render } from 'preact';
import { App } from '@/app/app';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

render(<App />, root);
