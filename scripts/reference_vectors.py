#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Milku-Commercial-1.0
"""Milku R32 v1 integer ISA oracle and deterministic verification vectors."""
import hashlib
import json
from pathlib import Path

OPS = dict(zip(
    'NOP LDI LUI ORI ADDI ADD SUB CMP LOAD STORE JUMP JZ HALT MULU MUL DIVU DIV MFLO MFHI MDSTAT'.split(),
    range(20),
))
MASK = 0xffffffff


def signed(value, bits=32):
    value &= (1 << bits) - 1
    return value - (1 << bits) if value & (1 << (bits - 1)) else value


def encode(op, rd=0, ra=0, rb=0, imm=0):
    if any(not isinstance(r, int) or not 0 <= r < 32 for r in (rd, ra, rb)):
        raise ValueError('Register index must be 0..31')
    opcode = OPS[op]
    immediate_ops = {'LDI', 'LUI', 'ORI', 'ADDI', 'LOAD', 'STORE', 'JUMP', 'JZ'}
    if op in immediate_ops:
        if not -32768 <= imm <= 65535:
            raise ValueError('Immediate does not fit 16 bits')
        low = imm & 65535
    else:
        low = rb << 11
    return opcode << 26 | rd << 21 | ra << 16 | low


def trace(words, limit=30000):
    registers = [0] * 32
    memory = {}
    pc = lo = hi = zero = carry = error = 0
    rows = []
    names = {value: key for key, value in OPS.items()}
    for _ in range(limit):
        word = words[pc]
        op = names.get(word >> 26, 'NOP')
        rd, ra, rb = (word >> 21) & 31, (word >> 16) & 31, (word >> 11) & 31
        immediate = signed(word, 16)
        a, b = registers[ra], registers[rb]
        next_pc = (pc + 1) & 65535
        result = None
        halted = int(op == 'HALT')
        if op == 'LDI': result = immediate & MASK
        elif op == 'LUI': result = (word & 65535) << 16
        elif op == 'ORI': result = a | (word & 65535)
        elif op in ('ADD', 'ADDI', 'SUB', 'CMP'):
            right = (immediate & MASK) if op == 'ADDI' else b
            subtract = op in ('SUB', 'CMP')
            raw = a - right if subtract else a + right
            value = raw & MASK
            zero = int(value == 0)
            carry = int(a >= right) if subtract else int(raw > MASK)
            if op != 'CMP': result = value
        elif op in ('LOAD', 'STORE'):
            address = (a + immediate) & 65535
            if op == 'LOAD': result = memory.get(address, 0)
            else: memory[address] = registers[rd]
        elif op == 'JUMP' or (op == 'JZ' and zero): next_pc = word & 65535
        elif op == 'HALT': next_pc = pc
        elif op in ('MULU', 'MUL', 'DIVU', 'DIV'):
            left, right = (signed(a), signed(b)) if op in ('MUL', 'DIV') else (a, b)
            error = 0
            if op in ('DIV', 'DIVU'):
                if right == 0: error = 1
                elif op == 'DIV' and left == -(1 << 31) and right == -1: error = 2
                if error: lo = hi = 0
                else:
                    quotient = abs(left) // abs(right)
                    if (left < 0) != (right < 0): quotient = -quotient
                    lo = quotient & MASK
                    hi = (left - quotient * right) & MASK
            else:
                product = (left * right) & ((1 << 64) - 1)
                lo, hi = product & MASK, product >> 32
            if not error: result = lo
        elif op == 'MFLO': result = lo
        elif op == 'MFHI': result = hi
        elif op == 'MDSTAT': result = error
        if result is not None: registers[rd] = result
        fields = [(pc,16),(word,32),(next_pc,16)]
        fields += [(r,32) for r in registers]
        fields += [(lo,32),(hi,32),(zero,1),(carry,1),(error,2),(halted,1),
                   (int(result is not None),1),(rd,5),(result or 0,32)]
        packed = 0
        for value, bits in fields: packed = packed << bits | value
        rows.append(packed)
        pc = next_pc
        if halted: return rows, memory
    raise RuntimeError('Program did not halt')


def make_program():
    words = []
    def emit(op, **kwargs): words.append(encode(op, **kwargs))
    def constant(rd, value):
        emit('LUI', rd=rd, imm=(value >> 16) & 65535)
        emit('ORI', rd=rd, ra=rd, imm=value & 65535)
    # Known machine words for 1+1, independent of encoder packing.
    words.extend([0x04000001, 0x04200001, 0x14400800])
    for r in range(32): constant(r, 0x91230000 + r * 257 + 1)
    # Every ordered pair exercises the full five-bit read indexes and every destination.
    for a in range(32):
        for b in range(32): emit('ADD', rd=(a*7+b*3)%32, ra=a, rb=b)
    # Every register serves as store data and load destination with a distinct base register.
    for r in range(32):
        base = (r+1)%32
        constant(base, 0x100+r)
        emit('STORE', rd=r, ra=base, imm=-128)
        emit('LOAD', rd=r, ra=base, imm=-128)
    values = [0,1,2,3,MASK,MASK-1,0x80000000,0x7fffffff,0x55555555,0xaaaaaaaa]
    for a in values:
        for b in values:
            for op in ('MULU','MUL','DIVU','DIV'):
                constant(29,a);constant(30,b)
                emit(op,rd=31,ra=29,rb=30)
                emit('MFLO',rd=16);emit('MFHI',rd=17);emit('MDSTAT',rd=18)
    seed = 0x13579bdf
    def rnd():
        nonlocal seed
        seed ^= (seed << 13) & MASK; seed ^= seed >> 17; seed ^= (seed << 5) & MASK
        return seed
    operations = [op for op in OPS if op not in ('JUMP','JZ','HALT')]
    for _ in range(2000):
        op = operations[rnd()%len(operations)]
        emit(op,rd=rnd()%32,ra=rnd()%32,rb=rnd()%32,imm=rnd()&65535)
    # Signed immediate boundaries and address wrap in both directions.
    for value in (0x8000,0x7fff,0xffff,0):
        emit('LDI',rd=31,imm=value);emit('ADDI',rd=30,ra=31,imm=value)
        emit('STORE',rd=30,ra=31,imm=value);emit('LOAD',rd=29,ra=31,imm=value)
    emit('LDI',rd=31,imm=4);emit('LDI',rd=30,imm=1)
    loop = len(words)
    emit('SUB',rd=31,ra=31,rb=30)
    emit('JZ',imm=loop+3);emit('JUMP',imm=loop)
    emit('LDI',rd=31,imm=1);emit('CMP',ra=31,rb=30)
    # Reserved operations must preserve all state, including flags.
    for op in range(20,64): words.append(op << 26 | (rnd() & 0x3ffffff))
    emit('JZ',imm=len(words)+2);emit('HALT')
    emit('LDI',rd=31,imm=2);emit('CMP',ra=31,rb=30)
    emit('JZ',imm=0);emit('HALT')
    return words


def main():
    root = Path(__file__).resolve().parent.parent / 'tests/vectors'
    root.mkdir(parents=True, exist_ok=True)
    words = make_program()
    rows, memory = trace(words)
    files = {
        'program32.hex': ''.join(f'{word:08x}\n' for word in words),
        'trace32.hex': ''.join(f'{row:0299x}\n' for row in rows),
        'memory32.hex': ''.join(f'@{address:04x} {value:08x}\n' for address,value in sorted(memory.items()) if value),
        'config.vh': f'localparam WORDS = {len(words)};\nlocalparam STEPS = {len(rows)};\n',
    }
    for name, text in files.items(): (root/name).write_text(text)
    manifest = {'isa':'Milku R32 v1','reference':'scripts/reference_vectors.py',
                'seed':'0x13579bdf','cases':[{'width':32,'registers':32,
                'instructions':len(words),'retirements':len(rows),
                'files':{name:hashlib.sha256(text.encode()).hexdigest() for name,text in files.items()}}]}
    (root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Generated {len(words)} instructions and {len(rows)} retirements')


if __name__ == '__main__': main()
