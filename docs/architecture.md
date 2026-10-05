# Lavaneko reconstruction architecture

## Evidence and scope

The only original artifact supplied is `reference/legacy-cpu.jpg`, a cropped Logisim top-level screenshot. The original `.circ`, subcircuits and exact instruction bit assignments are unavailable. These projects reconstruct the visible architecture; they are not a byte-for-byte recovery. Both 16-bit and 32-bit datapaths are provided. Neither project is a PCB schematic or a pin-accurate 74-family electrical simulation.

Observed: four registers, independent register control, a shared calculation-result writeback path, ROM-derived control fields, an add/subtract unit, PC with jump control, and separate RAM.

Reconstruction decisions: two independently selected logical register read paths; mux-based read selection to avoid multi-driver ambiguity; fixed-width horizontal control word; a rising-edge instruction latch and falling-edge execution; explicit zero/carry flags, conditional jump, halt and reset. These are implementation choices, not claims about the original subcircuits.

## Module boundaries

- `AddSub`: A, B, SUB -> result, carry/no-borrow, zero. Four-bit adders cascade; four slices at 16 bits and eight at 32 bits. Complement selection implements subtraction.
- `RegisterBank`: two read indexes and one write index. Four full-width registers. Falling-edge write with enable; asynchronous clear.
- `ProgramCounter`: 16-bit state, increment, load target, enable and reset. Its dedicated incrementer reflects the screenshot's independent PC block; this version does not claim the minimum physical chip count.
- `ProgramROM`: 65536 horizontal instruction words, each containing 16 control bits and a full-width immediate.
- `Control`: decodes legacy control fields and the multiply/divide extension, masking all legacy side effects for extended instructions.
- `DataRAM`: 65536 data words, independent address/data paths, edge-triggered writes and combinational read.
- `Lavaneko`: program ROM, IR, modules, clock and reset, plus visible output probes.
- `CPU_Test`: same composition with explicit clock/reset inputs for sequential test vectors.

Dependencies are one-way: CLI filesystem/process adapter -> circuit generator -> ISA encoder. Tests use package public entry points and native Logisim simulation.

## Reconstructed control word

Control bits 0..15: SUB, register write, RAM load/writeback, RAM store, unconditional jump, zero B, halt, register A select, B index[2], destination index[2], A index[2], flag write, jump if saved Z.

Bits 16..(16+W-1) hold an immediate. A selects immediate or selected register A; B selects selected register B or zero. Arithmetic computes A+B or A-B. RAM address and jump target use immediate bits 15..0. One PC address means one entire instruction, independent of data width.

Register display names REG1..REG4 map to indexes 0..3. Writes can target any register; no automatic rotation is imposed. Reset clears registers, PC, IR, flags and RAM. Fetch is rising-edge when no multiply/divide is pending; register/PC/RAM commit is falling-edge. HALT prevents further state writes and PC updates until reset. PC updates and memory operations preserve flags unless flag-write is asserted.

Unsupported: a general signed overflow flag, interrupts, stack/call conventions, standalone shift instructions and a physical board netlist. The signed division overflow status described below is specific to division.

## Diagram layout

The main sheet follows a left-to-right reading order: PC, program ROM, instruction latch, decoder, register bank, arithmetic, data memory and writeback. Fetch and arithmetic buses use direct orthogonal wires. Clock, reset, enable and branch control stay below the primary flow or use named nets. The numbering is a drawing guide, not a claim that the CPU is an eight-stage pipeline. Memory addressing remains immediate-based as specified above; the arithmetic result bypasses RAM into the writeback selector.


## Independent multiply/divide hardware

`MultiplyUnit` and `DivideUnit` have separate arithmetic and state; neither uses the main `AddSub`. Each has CLK, RESET, START, ACK, SIGNED, A and B inputs and BUSY, DONE, LO, HI, ERROR outputs. Inputs and sign controls latch only when START is accepted while BUSY=0 and DONE=0. DONE remains asserted until ACK. RESET asynchronously clears the unit even during a calculation. Outputs are valid when DONE=1.

Multiplication uses a W-bit multiplicand M, W-bit high accumulator H, W-bit Q and an iteration counter. At load, H=0 and Q=abs(B). Each round adds M to H if Q[0]=1, then shifts the combined carry:H:Q right by one. After W rounds H:Q is the full unsigned product. Signed mode converts operand magnitudes before iteration and conditionally negates the full 2W-bit product afterward. The minimum signed input magnitude remains representable as an unsigned W-bit value.

Division uses W-bit Q, W-bit divisor D and W+1-bit remainder R. At load, R=0 and Q=abs(A). Each round shifts R:Q left, computes shifted R-D, and uses the subtraction no-borrow output to select either the difference (quotient bit 1) or the pre-subtraction remainder (quotient bit 0). Restoration is a mux choice, not an extra addition cycle. After W rounds, quotient and remainder receive their signs: quotient truncates toward zero, remainder has the dividend's sign. Successful division satisfies A=B*quotient+remainder and abs(remainder)<abs(B).

`SliceArithmeticW` cascades four-bit adders. W+1 subtraction is padded to the next multiple of four, with zero-extended operands and full padded complement; the final carry gives no-borrow. `ConditionalNegateW` uses a dedicated subtract-from-zero path. Fixed shifts are splitter wiring. These are inspectable subcircuits, without built-in Multiplier, Divider or software execution components. Reusing a subcircuit definition creates separate hardware instances; it does not share a physical adder.

## Extended instruction encoding

When control bits 7 and 6 are both 1, the low eight bits form an extended opcode. Bits 13:12, 11:10 and 9:8 retain source A, destination and source B selection. Bits 15:14 and the immediate are ignored for this class; encode them as zero. Other control combinations retain the legacy interpretation. Reserved extended opcodes act as NOP and never assert legacy RAM, branch, flag or halt controls.

| Instruction | Low byte | Effect |
|---|---|---|
| MULU Rd, Ra, Rb | C0 | Unsigned full product in HI:LO; Rd=LO |
| MUL Rd, Ra, Rb | C1 | Signed full product in HI:LO; Rd=LO |
| DIVU Rd, Ra, Rb | C2 | Unsigned quotient in LO and remainder in HI; Rd=LO |
| DIV Rd, Ra, Rb | C3 | Signed quotient in LO and remainder in HI; Rd=LO |
| MFLO Rd | C4 | Rd=LO |
| MFHI Rd | C5 | Rd=HI |
| MDSTAT Rd | C6 | Rd=zero-extended MD_ERROR |

All seven instructions preserve Z and C. HI/LO hold the last completed result, not the intermediate unit state. Multiply never reports overflow because the full product is retained. The destination receives only its low W bits. A new successful multiply/divide clears MD_ERROR; MFLO/MFHI/MDSTAT preserve it.

| MD_ERROR | Meaning | Architectural result |
|---|---|---|
| 0 | Success | Update destination and HI/LO |
| 1 | Division by zero | Preserve destination; HI=LO=0; advance PC |
| 2 | Signed MIN / -1 | Preserve destination; HI=LO=0; advance PC |

The CPU sequencer latches BUSY on the first execution falling edge, accepts operands and holds IR/PC throughout the operation. W subsequent falling edges perform rounds. At the next falling edge it writes the destination (if successful), HI/LO and status, advances PC and acknowledges DONE. Normal multiply/divide therefore takes W+2 execution falling edges: 18 at 16 bits, 34 at 32 bits. Invalid division uses two edges: accept and error commit. A rising edge between finish and commit cannot fetch a new instruction because the CPU's BUSY latch remains set. Back-to-back operations are supported.

`toolchain/programs/demo16.hex` and `demo32.hex` now include the legacy arithmetic/memory/branch demo followed by signed and unsigned multiply/divide, special-register reads, both error conditions and recovery. They halt at PC=47 (0x002F), with REG1=7, REG2=-3, REG3=-2, REG4=1, LO=-2, HI=1, MD_ERROR=0, Z=C=1. Register negatives use W-bit two's complement. The original 21-word example remains in `legacy16.hex` and `legacy32.hex`.
