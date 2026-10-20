# Codetown

Describe software, or a change to it, in a few lines of plain words, and draw it as an animated city.

```text
system "Corner Shop"
intent "Customers browse products and pay for orders"

service orders "Order service" size=4
  endpoint POST /orders
  function createOrder
  guard jwt

service payments "Payment service"
  function charge

database ordersdb "Postgres: orders"
external cards "Card network"

orders calls payments
orders writes ordersdb traffic=high
payments calls cards "card charges"

slow payments -> cards "Timeouts calling the card network"
risk 1 at payments "Unpaid orders when the card network times out" impact=hang certainty=conditional blast=many
```

Services become buildings, functions are workers at the windows, endpoints are doors, databases are warehouses, calls are roads with cars on them. A slow connection crawls, a bug is a crack in the wall, a risk is the hazard its impact names.

## Install

```sh
npm install @sourceant/codetown
```

## Command line

```sh
codetown check shop.town                 # report problems; exits 1 on errors
codetown fmt shop.town --write           # rewrite in the canonical form
codetown render shop.town -o shop.svg    # draw it; --still for no animation, --theme light|dark
codetown diff before.town after.town     # one town showing how the first became the second
codetown json shop.town                  # the parsed town, for other tools
codetown words                           # every word, its meaning and its source
```

## Library

```ts
import { parse, render, diff, format } from '@sourceant/codetown';

const town = parse(source);
if (town.diagnostics.length) console.log(town.diagnostics);
const svg = render(town, { animate: true, theme: 'auto' });
```

`render` returns one self-contained SVG with its own light and dark styles. Every place carries `data-id`, every risk `data-risk` and every behavior `data-behavior`, so a page can make them clickable.

## The language

One statement per line. `#` starts a comment.

| Write | Means |
| --- | --- |
| `system "Name"` | The system being drawn |
| `intent "..."` | What the system or change is for, shown on a banner |
| `purpose fix "..."` | What a change is for, as a Conventional Commits type |
| `district id "Label"` | A neighbourhood; places join it with `in=id` |
| `service id "Label" in=core size=1-5` | A place: `service`, `database`, `cache`, `queue`, `topic`, `external`, `person` and others |
| indented `function name` | A member inside the place above: `endpoint`, `function`, `class`, `config`, `job`, `guard` and others |
| `a calls b "label" traffic=low\|normal\|high` | A link: `calls`, `reads`, `writes`, `sends`, `triggers` and others |
| `bug a.member "why"`, `slow a -> b` | A condition on a place, a member or a link |
| `risk 1 at target "text" impact= certainty= blast= trigger=` | A finding, drawn as the hazard its impact names |
| `behavior B1 at target "before" -> "after"` | A numbered signpost for a change in behavior |
| `test target "name" count=2` | An inspector's badge |
| `trip id: a -> b -> c` | A vehicle travelling that path |

A mark before a line says how a change touched it: `+` added, `~` modified, `-` deleted, `>` renamed, `*` copied, `!` type changed. Added work gets a crane, modified work scaffolding, deleted work is boarded up.

Every word comes from a vocabulary engineers already publish and use: the C4 model, ArchiMate, the Language Server Protocol's symbol kinds, Enterprise Integration Patterns, git's change letters, the dependability taxonomy of Avizienis et al., the SRE golden signals and Conventional Commits. [VOCABULARY.md](VOCABULARY.md) lists each word with its source.

## Worlds

The language names concepts once; a world draws them. `world town` is the only world drawn so far. `body`, `workshop` and `bank` are accepted and drawn as the town until their symbols are built.
