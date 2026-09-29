import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const checkout = process.argv[2];
if (!checkout) throw new Error('Usage: npm run test:denova -- <Denova checkout>');
const root = fileURLToPath(new URL('..', import.meta.url)), target = resolve(checkout);
await access(join(target,'internal/platform/platform_test.go'));
const virtual = join(target,'internal/platform/zz_index_runtime_test.go');
try { await access(virtual); throw new Error('Overlay target already exists'); } catch(error) { if(error.code!=='ENOENT') throw error; }
const cultivationVirtual = join(target,'internal/app/resourceexchange/zz_index_cultivation_test.go');
try { await access(cultivationVirtual); throw new Error('Overlay target already exists'); } catch(error) { if(error.code!=='ENOENT') throw error; }
const temporary = await mkdtemp(join(tmpdir(),'denova-index-verification-'));
const overlay = join(temporary,'overlay.json');
await writeFile(overlay,JSON.stringify({Replace:{[virtual]:join(root,'scripts/denova-runtime_test.go'),[cultivationVirtual]:join(root,'scripts/denova-cultivation_test.go')}}));
try {
  const code = await new Promise((resolve,reject)=>{
    const child = spawn('go',['test','-overlay',overlay,'./internal/app/resourceexchange','./internal/platform','-run','TestIndexExamplesValidation|TestIndexCultivationMaterials|TestIndexRuntimeExamples','-count=1','-v'],{
      cwd:target,stdio:'inherit',env:{...process.env,DENOVA_INDEX_REPO:root,DENOVA_INDEX_EXAMPLES_DIR:join(root,'examples')}
    });
    child.on('error',reject); child.on('exit',resolve);
  });
  if(code!==0) process.exitCode=code||1;
} finally { await rm(temporary,{recursive:true,force:true}); }
