// SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
if (!process.argv[2]) throw new Error('Usage: node scripts/reference_vectors.mjs <upstream-checkout>');
const upstream=path.resolve(process.argv[2]);
const revision=execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(revision!=='8e249ae491903985db7ca79df683efa5b7946267') throw new Error('Wrong reference revision');
if(execFileSync('git',['-C',upstream,'status','--porcelain'],{encoding:'utf8'}).trim()) throw new Error('Reference checkout must be clean');
const {isa}=await import(pathToFileURL(path.join(upstream,'cpu/isa/index.js')));
import fs from 'node:fs';
import crypto from 'node:crypto';
const root=fileURLToPath(new URL('../tests/vectors/',import.meta.url));
const manifest={upstream:'lavamilkTeam/lavanekoCPU',commit:'8e249ae491903985db7ca79df683efa5b7946267',reference:'cpu/isa/index.js',seed:'0x13579bdf',cases:[]};
for(const width of [16,32]){
 let seed=0x13579bdf;
 const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
 const mask=(1n<<BigInt(width))-1n;
 const words=isa.extendedDemo({width}).slice(0,-1).map(x=>x.word);
 const add=(operation,destination=0,sourceA=0,sourceB=0,immediate=0)=>words.push(isa.encode({width,operation,destination,sourceA,sourceB,immediate}));
 const values=[0n,1n,2n,3n,mask,mask-1n,1n<<BigInt(width-1),(1n<<BigInt(width-1))-1n,0x5555n,0xaaaan];
 for(const a of values)for(const b of values)for(const op of ['mulu','mul','divu','div']){
  add('ldi',0,0,0,a);add('ldi',1,0,0,b);add(op,2,0,1);add('mflo',3);add('mfhi',3);add('mdstat',3);
 }
 for(let n=0;n<1000;n++){
  const dst=rnd()%4, a=rnd()%4,b=rnd()%4;
  const ops=['ldi','addi','add','sub','cmp','load','store','mulu','mul','divu','div','mflo','mfhi','mdstat','nop'];
  const op=ops[rnd()%ops.length];
  add(op,dst,a,b,op==='load'||op==='store'?rnd()%128:rnd());
 }
 // Raw horizontal words exercise combined effects, and reserved extensions.
 for(let n=0;n<512;n++){
  let control=rnd()&0xffff;
  control &= ~0x8050; // finite straight-line program: no branch/halt
  if(n%4===0) control=(control&0xff00)|0xc7|(rnd()&0x38);
  words.push((BigInt(rnd()%128)<<16n)|BigInt(control));
 }
 // Taken and not-taken branches use the previous Z flag even if this word writes flags.
 add('ldi',0,0,0,0);add('cmp',0,0,0);
 const target=words.length+2;
 words.push((BigInt(target)<<16n)|0xc022n); // old Z=1; immediate+0 produces nonzero
 add('halt');
 add('jz',0,0,0,0); // new Z=0, must not jump
 add('halt');
 const states=isa.trace({words,width,limit:20000});
 let old=states[0];const traces=[];
 const pack=(fields)=>fields.reduce((acc,[value,bits])=>(acc<<BigInt(bits))|BigInt(value),0n);
 for(const state of states.slice(1)){
  traces.push(pack([[old.pc,16],[words[old.pc],width+16],[state.pc,16],...state.registers.map(r=>[r,width]),[state.lo,width],[state.hi,width],[state.zero,1],[state.carry,1],[state.mdError,2],[Number(state.halted),1]]));old=state;
 }
 const write=(name,list,bits)=>{const data=list.map(x=>BigInt(x).toString(16).padStart(Math.ceil(bits/4),'0')).join('\n')+'\n';fs.writeFileSync(root+name,data);return crypto.createHash('sha256').update(data).digest('hex');};
 const files={};files[`program${width}.hex`]=write(`program${width}.hex`,words,width+16);files[`trace${width}.hex`]=write(`trace${width}.hex`,traces,53+7*width);
 const sparseMemory=[...old.memory.entries()].filter(([,v])=>v!==0n).sort(([a],[b])=>a-b)
  .map(([address,value])=>'@'+address.toString(16).padStart(4,'0')+' '+value.toString(16).padStart(width/4,'0')).join('\n')+'\n';
 fs.writeFileSync(root+`memory${width}.hex`,sparseMemory);
 files[`memory${width}.hex`]=crypto.createHash('sha256').update(sparseMemory).digest('hex');
 manifest.cases.push({width,instructions:words.length,retirements:traces.length,files});
}
fs.writeFileSync(root+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
