// Cria o arquivo de configuração da GSI na pasta do Dota (versão de terminal).
// Uso: npm run install-cfg              (procura sozinho)
//      npm run install-cfg -- --dir="D:\SteamLibrary\steamapps\common\dota 2 beta"
//      npm run install-cfg -- --print    (só mostra o conteúdo)
import { appConfig } from '../src/config.js';
import { LAUNCH_OPTION, buildCfg, installCfg } from '../src/gsi-cfg.js';

const argv = process.argv.slice(2);
if (argv.includes('--print')) {
  console.log(buildCfg(appConfig));
  process.exit(0);
}

const dir = argv.find((a) => a.startsWith('--dir='))?.slice('--dir='.length);
const result = installCfg(appConfig, dir);
if (!result.ok) {
  console.error(`${result.error} Rode de novo com --dir="...\\steamapps\\common\\dota 2 beta"`);
  process.exit(1);
}

console.log(`Arquivo criado: ${result.file}`);
console.log('\nÚltimo passo (uma vez só): na Steam, clique com o botão direito em Dota 2 > Propriedades >');
console.log(`Opções de inicialização, e adicione:  ${LAUNCH_OPTION}`);
console.log('Depois reinicie o Dota 2.');
