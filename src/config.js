import { ROOT, readJsonAsset } from './paths.js';

export { ROOT };
export const loadJson = readJsonAsset;

export const appConfig = readJsonAsset('config/app.json');
// PORT=xxxx permite rodar um segundo assistente (ex.: testes) sem conflitar.
if (process.env.PORT) appConfig.port = Number(process.env.PORT);
