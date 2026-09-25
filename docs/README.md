# Documentation

SatStake was specified before it was built. Each document below is derived from the one before it, and every line of contract code and every test points back to a requirement.

| Document | Question it answers |
|---|---|
| [01 Verification pass](01_VERIFICATION_PASS.md) | What is actually true about Arc today, with sources? |
| [02 North Star](02_NORTH_STAR.md) | What is SatStake, for whom, and which properties must never be lost? |
| [03 User journeys](03_USER_JOURNEYS.md) | Every way every actor, human or system, interacts with it |
| [04 High-level requirements](04_HLR.md) | What the system shall do, traced to journeys |
| [05 Low-level requirements](05_LLR.md) | Exactly how, precise enough to test: interface, state machine, rules, messages |
| [06 Verification plan](06_VERIFICATION_PLAN.md) | How each requirement is proven, test first, and how traceability is checked |
| TRACE_MATRIX.md (generated) | Requirement to code to test, for every requirement |
| ACCEPTANCE.md | Every journey and its verified outcome |
| INSPECTIONS.md and evidence/ | Records for requirements verified by inspection, analysis, or demonstration |

The method is a minimal form of DO-178C: high- and low-level requirements, derived requirements marked with their reasons, bidirectional traceability checked by a tool in CI, requirements-based tests written before code, and full structural coverage of the contract.
