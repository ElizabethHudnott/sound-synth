const audioContext = new AudioContext();
const system = new Synth.System(audioContext);
let gateTemporarilyOpen = false;
let schedulingStepNumber = 0;
let octaveOffset = 0;
let channels, timer;

system.ondatarecorded = function (blob) {
	const mediaElement = document.getElementById('recording');
	if (mediaElement.src.startsWith('blob:')) {
		URL.revokeObjectURL(mediaElement.src);
	}
	mediaElement.src = URL.createObjectURL(blob);
}

function set(parameterNumber, value, delay, changeType, channelNumber) {
	let time;
	if (delay !== undefined) {
		time = system.nextStep() + delay;
	}
	if (changeType === undefined) {
		changeType = Synth.ChangeType.SET;
	}
	if (channelNumber === undefined) {
		channelNumber = 0;
	}
	const parameterMap = new Map();
	parameterMap.set(parameterNumber, new Synth.Change(changeType, value));
	channels[channelNumber].setParameters(parameterMap, time);
}

function initialize() {
	audioContext.resume();
	let channel1 = new Synth.SubtractiveSynthChannel(system, true);
	let channel2 = new Synth.SubtractiveSynthChannel(system, true);
	channel2.connect(channel1);
	channels = [channel1, channel2];
	system.start();

	const parameterMap = new Map();
	parameterMap.set(Synth.Param.FILTER_MIX, new Synth.Change(Synth.ChangeType.SET, 0));
	parameterMap.set(Synth.Param.UNFILTERED_MIX, new Synth.Change(Synth.ChangeType.SET, 100));
	parameterMap.set(Synth.Param.ATTACK_CURVE, new Synth.Change(Synth.ChangeType.SET, 3));
	parameterMap.set(Synth.Param.DELAY, new Synth.Change(Synth.ChangeType.SET, 1));
	parameterMap.set(Synth.Param.LINE_TIME, new Synth.Change(Synth.ChangeType.SET, 50));
	parameterMap.set(Synth.Param.TICKS, new Synth.Change(Synth.ChangeType.SET, 50));
	channels[0].setParameters(parameterMap);

	sendNewLine();
	timer = setInterval(sendNewLine, 1000);

	const piano = new Synth.SampledInstrument();
	system.sampledInstruments[0] = piano;
	piano.loadSampleFromURL(audioContext, 0, 'samples/acoustic-grand-piano.wav', sampleLoaded);
	const guitar = new Synth.SampledInstrument();
	system.sampledInstruments[1] = guitar;
	const guitarSample = guitar.loadSampleFromURL(audioContext, 0, 'samples/guitar-strum.wav', sampleLoaded);
	guitarSample.sampledNote = 55;
	const violin = new Synth.SampledInstrument();
	system.sampledInstruments[2] = violin;
	const violinSample = violin.loadSampleFromURL(audioContext, 0, 'samples/violin.wav', sampleLoaded);
	violinSample.sampledNote = 46;
	document.getElementById('intro').style.display = 'none';
	document.getElementById('controls').style.display = 'block';
}

function sendNewLine() {
	const lineTime = channels[0].parameters[Synth.Param.LINE_TIME];
	schedulingStepNumber += lineTime;
	const nextStep = system.nextStep();
	const behind = schedulingStepNumber < nextStep;
	if (behind) {
		schedulingStepNumber = nextStep;
	}
	if (channels[0].parameters[Synth.Param.GATE] === Synth.Gate.OPEN) {
		channels[0].setParameters(new Map(), schedulingStepNumber, true);
	}
	if (behind) {
		sendNewLine();
	}
}

function playNote(gate) {
	const noteNumber = parseInt(document.getElementById('note').value);
	document.getElementById('frequency').value = channels[0].noteFrequencies[noteNumber];
	const notes = [noteNumber];
	const chord = document.getElementById('chord').value;
	for (let i = 0; i < chord.length; i++) {
		const interval = parseInt(chord[i], 36);
		notes.push(noteNumber + interval - 1);
	}
	const parameterMap = new Map();
	parameterMap.set(Synth.Param.NOTES, new Synth.Change(Synth.ChangeType.SET, notes));
	if (channels[0].parameters[Synth.Param.GATE] !== Synth.Gate.OPEN) {
		parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, gate));
	}
	const step = system.nextStep();
	channels[0].setParameters(parameterMap, step, true);
	schedulingStepNumber = step;
}

function setLineTime(steps) {
	clearInterval(timer);
	timer = setInterval(sendNewLine, steps * 20);
	const ticksPerSecond = parseFloat(document.getElementById('ticks').value);
	const ticks = Math.round(steps / 50 * ticksPerSecond);
	const parameterMap = new Map();
	parameterMap.set(Synth.Param.LINE_TIME, new Synth.Change(Synth.ChangeType.SET, steps));
	parameterMap.set(Synth.Param.TICKS, new Synth.Change(Synth.ChangeType.SET, ticks));
	const step = system.nextStep();
	channels[0].setParameters(parameterMap, step, true);
	schedulingStepNumber = step;
}

function calcTicks() {
	const lineTime = channels[0].parameters[Synth.Param.LINE_TIME];
	const ticksPerSecond = parseFloat(document.getElementById('ticks').value);
	const ticks = Math.round(lineTime / 50 * ticksPerSecond);
	set(Synth.Param.TICKS, ticks);
}

function openGateTemporarily() {
	if (channels[0].parameters[Synth.Param.GATE] & 3 !== Synth.Gate.OPEN) {
		set(Synth.Param.GATE, Synth.Gate.REOPEN);
		gateTemporarilyOpen = true;
	}
}

function closeGateOpenedTemporarily() {
	if (gateTemporarilyOpen) {
		set(Synth.Param.GATE, Synth.Gate.CLOSED);
		gateTemporarilyOpen = false;
	}
}

document.addEventListener('keydown', function (event) {
	if (event.repeat || event.shiftKey || event.altKey || event.ctrlKey ||
		document.activeElement.type === 'text'
	) {
		return;
	}

	const code = event.code;

	if (code === 'Quote') {
		set(Synth.Param.GATE, Synth.Gate.CUT);
		event.preventDefault();
	} else if (code === 'NumpadDivide') {
		octaveOffset--;
		if (octaveOffset < -3) {
			octaveOffset = -3;
		}
		event.preventDefault();
	} else if (code === 'NumpadMultiply') {
		octaveOffset++;
		if (octaveOffset > 4) {
			octaveOffset = 4;
		}
		event.preventDefault();
	} else {
		const note = Synth.keymap.get(code);
		if (note !== undefined) {
			document.getElementById('note').value = octaveOffset * 12 + note;
			let gate;
			if (document.getElementById('one-shot').checked ||
				document.getElementById('samples').checked
			) {
				gate = Synth.Gate.TRIGGER;
			} else {
				gate = Synth.Gate.OPEN;
			}
			if (!document.getElementById('retrigger').checked) {
				gate = gate + Synth.Gate.MULTI_TRIGGERABLE;
			}
			playNote(gate);
			event.preventDefault();
		}
	}
});

document.addEventListener('keyup', function (event) {
	if (event.shiftKey || event.altKey || event.ctrlKey ||
		document.activeElement.type === 'text'
	) {
		return;
	}

	const note = Synth.keymap.get(event.code);
	if (note !== undefined) {
		if (!document.getElementById('one-shot').checked) {
			set(Synth.Param.GATE, Synth.Gate.CLOSED);
			event.preventDefault();
		}
	}
});

function sampleLoaded(url, success, message) {
	if (success) {
		console.log('Loaded ' + url);
	} else {
		console.error('Failed to load ' + url + '. ' + message);
	}
}

function uploadSamples() {
	const files = document.getElementById('sample-upload').files;
	const dropDown = document.getElementById('sample-list');
	const offset = dropDown.children.length;
	for (let i = 0; i < files.length; i++) {
		const option = document.createElement('option');
		option.value = offset + i;
		option.appendChild(document.createTextNode(files[i].name));
		dropDown.appendChild(option);
	}

	function fileLoaded(file) {
		console.log('Loaded ' + file.name);
	}

	for (let i = 0; i < files.length; i++) {
		const instrument = new Synth.SampledInstrument();
		system.sampledInstruments[offset + i] = instrument;
		instrument.loadSampleFromFile(audioContext, 0, files[i], fileLoaded, [i]);
	}
}

function pauseRecording() {
	if (system.recordingState === 'paused') {
		system.resumeRecording();
	} else {
		system.requestRecording();
		system.pauseRecording();
	}
}
