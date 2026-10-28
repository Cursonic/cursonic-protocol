import { initReveal, initSpotlight, initProgress, initParallax } from './motion.js';
import { initMenu, initCA, initRecords, initJobs } from './ui.js';
import { initMarket } from './market.js';

const register = JSON.parse(document.getElementById('register').textContent);
initProgress();
initMenu();
initCA();
initRecords(register);
initJobs();
initSpotlight();
initParallax();
initReveal();
initMarket(register);
