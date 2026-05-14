const pads = [
  { key: "Q", name: "Kick", family: "Davul", type: "kick", group: "Drums" },
  { key: "W", name: "Snare", family: "Davul", type: "snare", group: "Drums" },
  { key: "E", name: "Hi-Hat", family: "Davul", type: "hihat", group: "Drums" },
  { key: "R", name: "Tom", family: "Davul", type: "tom", group: "Drums" },
  { key: "A", name: "Crash", family: "Zil", type: "crash", group: "Cymbals" },
  { key: "S", name: "Ride", family: "Zil", type: "ride", group: "Cymbals" },
  { key: "D", name: "Clap", family: "Perküsyon", type: "clap", group: "Perc" },
  { key: "F", name: "Shaker", family: "Perküsyon", type: "shaker", group: "Perc" },
  { key: "Z", name: "Saz La", family: "Saz", type: "pluck", freq: 220, group: "Strings" },
  { key: "X", name: "Saz Re", family: "Saz", type: "pluck", freq: 293.66, group: "Strings" },
  { key: "C", name: "Mızıka Do", family: "Mızıka", type: "harmonica", freq: 261.63, group: "Wind" },
  { key: "V", name: "Mızıka Sol", family: "Mızıka", type: "harmonica", freq: 392, group: "Wind" },
  { key: "1", name: "Bass", family: "Synth", type: "bass", freq: 110, group: "Synth" },
  { key: "2", name: "Lead", family: "Synth", type: "lead", freq: 440, group: "Synth" },
];

const SEQUENCER_PADS = ["Q", "W", "E", "D", "1", "2"];
const STEPS = 16;
const pattern = new Map(SEQUENCER_PADS.map((key) => [key, Array(STEPS).fill(false)]));

const FL_LAYOUT = [
  ["Q", "W", "E", "R"],
  ["A", "S", "D", "F"],
  ["Z", "X", "C", "V"],
  ["1", "2"],
];

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const master = audioCtx.createGain();
master.gain.value = 0.75;
master.connect(audioCtx.destination);

const activeNodes = new Set();
let beatInterval;
let currentStep = 0;

function envGain(start, peak, end, decay = 0.2) {
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(start, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(peak, audioCtx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end), audioCtx.currentTime + decay);
  return g;
}

function noiseBuffer(duration = 0.2) {
  const size = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function playPad(pad) {
  const now = audioCtx.currentTime;

  if (["kick", "tom", "bass", "lead", "pluck", "harmonica"].includes(pad.type)) {
    const osc = audioCtx.createOscillator();
    const g = envGain(0.0001, 0.8, 0.0001, pad.type === "lead" ? 0.5 : 0.35);

    if (pad.type === "kick") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
    } else if (pad.type === "tom") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.25);
    } else if (pad.type === "bass") {
      osc.type = "square";
      osc.frequency.value = pad.freq;
    } else if (pad.type === "lead") {
      osc.type = "sawtooth";
      osc.frequency.value = pad.freq;
    } else if (pad.type === "pluck") {
      osc.type = "triangle";
      osc.frequency.value = pad.freq;
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    } else if (pad.type === "harmonica") {
      osc.type = "square";
      osc.frequency.value = pad.freq;
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.frequency.value = 6;
      lfoGain.gain.value = 12;
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start();
      lfo.stop(now + 0.5);
    }

    osc.connect(g).connect(master);
    osc.start();
    osc.stop(now + (pad.type === "lead" ? 0.6 : 0.35));
    activeNodes.add(osc);
    osc.onended = () => activeNodes.delete(osc);
    return;
  }

  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer(pad.type === "crash" || pad.type === "ride" ? 0.55 : 0.25);
  const filter = audioCtx.createBiquadFilter();
  const g = envGain(0.0001, 0.65, 0.0001, pad.type === "crash" || pad.type === "ride" ? 0.5 : 0.2);

  if (pad.type === "snare" || pad.type === "clap") {
    filter.type = "bandpass";
    filter.frequency.value = 1800;
  } else if (pad.type === "hihat" || pad.type === "shaker") {
    filter.type = "highpass";
    filter.frequency.value = 4500;
  } else {
    filter.type = "highpass";
    filter.frequency.value = 2500;
  }

  src.connect(filter).connect(g).connect(master);
  src.start();
  src.stop(now + 0.6);
  activeNodes.add(src);
  src.onended = () => activeNodes.delete(src);
}

function createPadNode(tpl, pad) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.key = pad.key;
  node.querySelector(".key").textContent = pad.key;
  node.querySelector(".name").textContent = pad.name;
  node.querySelector(".family").textContent = `${pad.family} • ${pad.group}`;
  node.addEventListener("pointerdown", async () => {
    if (audioCtx.state === "suspended") await audioCtx.resume();
    node.classList.add("active");
    playPad(pad);
    setTimeout(() => node.classList.remove("active"), 120);
  });
  return node;
}

function renderPads() {
  const grid = document.getElementById("padGrid");
  const tpl = document.getElementById("padTemplate");
  const byKey = new Map(pads.map((pad) => [pad.key, pad]));

  FL_LAYOUT.forEach((row, index) => {
    const rowNode = document.createElement("div");
    rowNode.className = "pad-row";
    rowNode.dataset.row = String(index + 1);

    row.forEach((key) => {
      const pad = byKey.get(key);
      if (!pad) return;
      rowNode.appendChild(createPadNode(tpl, pad));
    });

    grid.appendChild(rowNode);
  });
}

function renderSequencer() {
  const seq = document.getElementById("sequencer");
  seq.innerHTML = "";
  const byKey = new Map(pads.map((pad) => [pad.key, pad]));

  SEQUENCER_PADS.forEach((key) => {
    const row = document.createElement("div");
    row.className = "seq-row";

    const label = document.createElement("div");
    const pad = byKey.get(key);
    label.className = "seq-label";
    label.textContent = `${key} • ${pad?.name || "Pad"}`;
    row.appendChild(label);

    pattern.get(key).forEach((isOn, stepIndex) => {
      const btn = document.createElement("button");
      btn.className = `seq-step${isOn ? " active" : ""}`;
      btn.dataset.key = key;
      btn.dataset.step = String(stepIndex);
      btn.addEventListener("click", () => {
        const rowPattern = pattern.get(key);
        rowPattern[stepIndex] = !rowPattern[stepIndex];
        btn.classList.toggle("active", rowPattern[stepIndex]);
      });
      row.appendChild(btn);
    });

    seq.appendChild(row);
  });
}

function clearBeat() {
  SEQUENCER_PADS.forEach((key) => {
    pattern.set(key, Array(STEPS).fill(false));
  });
  renderSequencer();
}

function updateStepMarker(step) {
  document.querySelectorAll(".seq-step").forEach((node) => node.classList.remove("playing"));
  document.querySelectorAll(`.seq-step[data-step=\"${step}\"]`).forEach((node) => node.classList.add("playing"));
}

async function startBeat() {
  if (audioCtx.state === "suspended") await audioCtx.resume();
  stopBeat();

  const bpm = Math.max(60, Math.min(180, Number(document.getElementById("bpm").value) || 120));
  const stepDuration = (60 / bpm) / 4;
  const stepDurationMs = stepDuration * 1000;
  const byKey = new Map(pads.map((pad) => [pad.key, pad]));

  beatInterval = setInterval(() => {
    updateStepMarker(currentStep);

    SEQUENCER_PADS.forEach((key) => {
      if (!pattern.get(key)[currentStep]) return;
      const pad = byKey.get(key);
      if (pad) playPad(pad);
    });

    currentStep = (currentStep + 1) % STEPS;
  }, stepDurationMs);
}

function stopBeat() {
  if (beatInterval) clearInterval(beatInterval);
  beatInterval = null;
  currentStep = 0;
  updateStepMarker(-1);
}

document.getElementById("volume").addEventListener("input", (e) => {
  master.gain.value = Number(e.target.value);
});

document.getElementById("stopAll").addEventListener("click", () => {
  activeNodes.forEach((n) => {
    try { n.stop(); } catch (_) {}
  });
  activeNodes.clear();
});

document.getElementById("playBeat").addEventListener("click", startBeat);
document.getElementById("stopBeat").addEventListener("click", stopBeat);
document.getElementById("clearBeat").addEventListener("click", clearBeat);

document.addEventListener("keydown", async (e) => {
  const key = e.key.toUpperCase();
  const pad = pads.find((p) => p.key === key);
  if (!pad) return;
  if (audioCtx.state === "suspended") await audioCtx.resume();
  playPad(pad);
  const btn = document.querySelector(`.pad[data-key="${key}"]`);
  if (btn) {
    btn.classList.add("active");
    setTimeout(() => btn.classList.remove("active"), 120);
  }
});

renderPads();
renderSequencer();
