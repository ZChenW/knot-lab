# Conventions

Knot theory texts differ in signs, in the order of rows and in how Δ(t) is
normalised. These are the ones Knot Lab uses everywhere: on screen, in LaTeX and in
exports.

## Strands and crossings

- A **strand** runs from one undercrossing to the next. Strands are numbered x₁, x₂, …
  along each component in its direction, one component after another. Click a strand's
  label to start the numbering from that strand.
- **Crossing i** is the crossing where strand xᵢ ends by passing under, and row i of
  each matrix belongs to it. A component that never passes under is one closed strand;
  its row is all zeros, as if it had an R1 kink.
- A crossing is **RH** (+1) or **LH** (−1). With both strands pointing up, it is RH when
  the strand on top runs from lower left to upper right and the under strand from
  lower right to upper left. The + or − at the start of a
  matrix row is the sign of that crossing.

## Writhe and linking numbers

- writhe = the sum of the signs of all crossings.
- lkᵢⱼ = (RH − LH) / 2, counting only the crossings between components i and j.
- For three components, I = lk₁₂ · lk₂₃ · lk₃₁. Reversing one component does not change
  its sign.

## The coloring matrix

At a crossing with the strand x on top, the strand y going in under it and the strand z
coming out, the row is

    2x − y − z

so x gets 2 and y and z get −1 (entries add up when two of them are the same strand).
A″ is the matrix with the last row and the last column deleted, unless you choose
others, and **det(K) = |det A″|**. With only one strand A″ is empty and its determinant
is 1.

## Labelings mod p

A mod p labeling gives every strand a value in ℤ/p with 2x − y − z ≡ 0 at every
crossing. `rank` is the dimension of the solutions of A″x ≡ 0 (mod p): the nullity, or number
of free variables, rather than the matrix rank. Thus

    labelings = p(pⁿ − 1),   n = rank

counts the labelings in which not every strand has the same value. The diagram is
p-colorable when n ≥ 1. For a knot this is equivalent to p dividing det(K).

## The Alexander polynomial

The Alexander matrix has the same rows and columns. With x on top, y going in under it
and z coming out:

| Crossing | x | y | z |
| --- | --- | --- | --- |
| RH | 1 − t | −1 | t |
| LH | 1 − t | t | −1 |

Δ(t) is det A″ divided by the power of t that makes its lowest term a constant, and
multiplied by −1 if that constant is negative. So Δ(t) is taken with a positive
constant term. For a link, Δ(t) depends on the orientations of the components. It is
not computed beyond 30 strands; past that, an unedited torus knot or twist knot from
the Families menu gets its Δ(t) from the family's formula, marked `formula`.

## Mirror and reverse

**Mirror** swaps over and under at every crossing and keeps the orientations, which
gives the mirror image Kᵐ. Some texts define the oriented mirror to reverse every
component as well; use **Reverse** on each component for that.

## Surfaces

- Seifert surface: χ(S) = s − c for s Seifert circles and c crossings, and
  g(S) = (2 − χ − B)/2 for each connected piece, where B counts its boundary
  components. The genus of the surface is the sum over the pieces.
- Disks with bands: χ = d − n for d disks and n bands. A band with an odd number of half
  twists reverses the side; positive half twists are right-handed.
- Triangulations: χ = V − E + F, where a side shared by two triangles, or a glued pair
  of sides, is one edge.
- Two connected surfaces are the same surface when χ, B and orientability agree.
