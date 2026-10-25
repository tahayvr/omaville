<!-- The chrome's icons: Phosphor (the Lyra style's set), light weight to match the plate's thin lines. -->
<script>
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import Minus from "phosphor-svelte/lib/Minus";
  import X from "phosphor-svelte/lib/X";
  import Users from "phosphor-svelte/lib/Users";
  import SidebarSimple from "phosphor-svelte/lib/SidebarSimple";
  import ChartBar from "phosphor-svelte/lib/ChartBar";
  import Gauge from "phosphor-svelte/lib/Gauge";
  import Plus from "phosphor-svelte/lib/Plus";
  import CornersOut from "phosphor-svelte/lib/CornersOut";
  import ArrowCounterClockwise from "phosphor-svelte/lib/ArrowCounterClockwise";
  import ArrowClockwise from "phosphor-svelte/lib/ArrowClockwise";
  import Record from "phosphor-svelte/lib/Record";
  import FilmStrip from "phosphor-svelte/lib/FilmStrip";
  import ClockCounterClockwise from "phosphor-svelte/lib/ClockCounterClockwise";
  import Play from "phosphor-svelte/lib/Play";
  import Pause from "phosphor-svelte/lib/Pause";
  import Question from "phosphor-svelte/lib/Question";
  import Sun from "phosphor-svelte/lib/Sun";
  import Moon from "phosphor-svelte/lib/Moon";
  let { name, size = "1em" } = $props();
  const ICONS = { search: MagnifyingGlass, min: Minus, close: X, people: Users, detail: SidebarSimple, days: ChartBar, gauge: Gauge, zin: Plus, fit: CornersOut, rotl: ArrowCounterClockwise, rotr: ArrowClockwise, clip: Record, film: FilmStrip, replay: ClockCounterClockwise, play: Play, pause: Pause, help: Question, sun: Sun, moon: Moon };
  const C = $derived(ICONS[name]);
</script>

<C {size} weight="light" aria-hidden="true" />
