#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
"""Use the scalar mathematical oracle independently for each SIMD thread."""
import hashlib
import json
import random
from pathlib import Path
from reference_vectors import encode, trace, MASK


def program(core):
    words=[]
    def emit(op, **kw): words.append(encode(op, **kw))
    def ident(op, rd): words.append(op << 26 | rd << 21)
    ident(22,31)
    emit('LDI',rd=30,imm=256)
    emit('MULU',rd=31,ra=31,rb=30)
    for r in range(31):
        ident(20,r)
        emit('ADDI',rd=r,ra=r,imm=core*103+r*7-70)
    ident(21,20)
    # All register read indexes, using lane-dependent data (including writable R0).
    for a in range(32):
        for b in range(32): emit('ADD',rd=(a*7+b*3)%31,ra=a,rb=b)
    # All mul/div opcodes: sign, zero, overflow and different completion latencies.
    ident(20,0)
    emit('LDI',rd=1,imm=-1)
    emit('DIV',rd=2,ra=1,rb=0)
    emit('MDSTAT',rd=3);emit('MFLO',rd=4);emit('MFHI',rd=5)
    emit('LUI',rd=6,imm=0x8000)
    emit('DIV',rd=7,ra=6,rb=1)
    emit('MDSTAT',rd=8);emit('MFLO',rd=9);emit('MFHI',rd=10)
    rng=random.Random(0x7654+core)
    ops='LDI LUI ORI ADDI ADD SUB CMP LOAD STORE MULU MUL DIVU DIV MFLO MFHI MDSTAT'.split()
    for i in range(300):
        op=rng.choice(ops)
        emit(op,rd=rng.randrange(31),ra=31 if op in ('LOAD','STORE') else rng.randrange(32),
             rb=rng.randrange(32),imm=rng.randrange(128) if op in ('LOAD','STORE') else rng.randrange(65536))
    # Uniform loop, zero/nonzero decisions, flags preserved across identity and reserved ops.
    emit('LDI',rd=30,imm=3+core);emit('LDI',rd=29,imm=1)
    loop=len(words)
    emit('SUB',rd=30,ra=30,rb=29);emit('JZ',imm=loop+3);emit('JUMP',imm=loop)
    emit('CMP',ra=29,rb=29)
    for op in range(23,64): words.append(op<<26 | rng.randrange(1<<26))
    ident(20,27);ident(21,28);ident(22,26)
    emit('JZ',imm=len(words)+2);emit('HALT')
    for r in range(31): emit('STORE',rd=r,ra=31,imm=128+r)
    # Read every final register after memory operations; high registers included.
    for r in range(31): emit('LOAD',rd=r,ra=31,imm=128+r)
    emit('HALT')
    return words


def main():
    root=Path(__file__).resolve().parent.parent/'tests/vectors/gpu'
    root.mkdir(exist_ok=True)
    outputs={}
    final={}
    counts=[]
    cores=4
    for core in range(cores):
        words=program(core)
        outputs[f'program{core}.hex']=''.join(f'{w:08x}\n' for w in words)
        traces=[]
        for lane in range(16):
            task=core*16+lane
            initial={task*256+i: ((task*256+i)*0x10203+0x31415926)&MASK for i in range(256)}
            rows,memory=trace(words,gpu_identity=dict(LANEID=lane,COREID=core,TASKID=task),initial_memory=initial)
            traces.append(rows);final.update(memory)
        assert len({len(t) for t in traces})==1
        packed=[]
        for step in range(len(traces[0])):
            first=traces[0][step]
            pc=first>>1179
            word=(first>>1147)&MASK
            if core: # Both programs live in the same instruction address space.
                pc+=core*4096
                if word>>26 in (10,11): word=(word&0xffff0000)|((word+core*4096)&65535)
            mask=sum(((traces[l][step]>>37)&1)<<l for l in range(16))
            data=sum((traces[l][step]&MASK)<<(l*32) for l in range(16))
            packed.append((pc<<560)|(word<<528)|(mask<<512)|data)
        outputs[f'trace{core}.hex']=''.join(f'{v:0144x}\n' for v in packed)
        if core:
            words=[(w&0xffff0000)|((w+core*4096)&65535) if w>>26 in (10,11) else w for w in words]
            outputs[f'program{core}.hex']=''.join(f'{w:08x}\n' for w in words)
        counts.append((len(words),len(packed)))
    outputs['memory.hex']=''.join(f'{final[a]:08x}\n' for a in range(cores*16*256))
    outputs['config.vh']=''.join(f'localparam WORDS{i}={w}, STEPS{i}={s};\n' for i,(w,s) in enumerate(counts))
    outputs['config.vh']+=f'localparam MAX_STEPS={max(s for w,s in counts)}, VECTOR_CORES={cores};\n'
    for name,column in [('program_words',0),('trace_steps',1)]:
        outputs['config.vh']+=f'function integer {name};\ninput integer core;\nbegin\ncase(core)\n'
        outputs['config.vh']+=''.join(f'{i}: {name}={count[column]};\n' for i,count in enumerate(counts))
        outputs['config.vh']+=f'default: {name}=0;\nendcase\nend\nendfunction\n'
    for name,content in outputs.items(): (root/name).write_text(content)
    (root/'manifest.json').write_text(json.dumps({'isa':'R32 SIMD v1','cores':cores,'lanes':16,'cases':[{'files':{k:hashlib.sha256(v.encode()).hexdigest() for k,v in outputs.items()}}]},indent=2)+'\n')
    print('GPU vectors:',counts,f'{cores*16} independent thread oracles')

if __name__=='__main__': main()
